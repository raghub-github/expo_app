/**
 * Centralized distance engine:
 * - Mapbox Directions (primary)
 * - OSRM (secondary fallback)
 * - Haversine (last-resort approximate fallback)
 */

import type { LatLng, RouteResult, RoutingProfile } from "./distance.types.js";
import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { routeDistanceCache } from "../../db/schema.js";
import { cacheGet, cacheSet } from "@gatimitra/redis";

const EARTH_RADIUS_METERS = 6_371_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_TTL_SEC = 10 * 60;
const DB_CACHE_TTL_MS = 30 * 60 * 1000;

export type GetRouteOptions = {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  profile?: RoutingProfile;
  mapboxToken?: string;
  osrmBaseUrl?: string;
  skipCache?: boolean;
};

/**
 * Two-layer cache: in-process Map for sub-ms hits within a single request
 * burst, plus Redis for cross-replica consistency. Behind a load balancer,
 * a Mapbox quote computed by replica A becomes immediately reusable by
 * replica B (no second Mapbox round-trip). All cache misses fall through to
 * the same fetch path, so Redis being down only degrades latency.
 */
const memoryCache = new Map<string, { value: RouteResult; expiresAt: number }>();
const MEMORY_CACHE_MAX = 2000;

function r(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function cacheKey(options: GetRouteOptions): string {
  const profile = options.profile ?? "driving";
  const points = [options.origin, ...(options.waypoints ?? []), options.destination]
    .map((p) => `${r(p.lat)},${r(p.lng)}`)
    .join("|");
  return `distance:${profile}:${points}`;
}

async function getCached(key: string): Promise<RouteResult | null> {
  // 1. Process-local Map first (no network).
  const entry = memoryCache.get(key);
  if (entry) {
    if (Date.now() <= entry.expiresAt) return { ...entry.value, cached: true };
    memoryCache.delete(key);
  }
  // 2. Redis — shared across replicas.
  try {
    const remote = await cacheGet<RouteResult>(key);
    if (remote) {
      // Re-populate the local map so subsequent same-replica calls skip Redis.
      memoryCacheSet(key, remote);
      return { ...remote, cached: true };
    }
  } catch {
    /* Redis down — degrade to upstream lookup. */
  }
  return null;
}

function memoryCacheSet(key: string, value: RouteResult): void {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, {
    value: { ...value, cached: false },
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function setCached(key: string, value: RouteResult): void {
  memoryCacheSet(key, value);
  void cacheSet(key, value, CACHE_TTL_SEC).catch(() => {
    /* tolerated — local cache still good for this replica. */
  });
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const a2 = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
  return EARTH_RADIUS_METERS * c;
}

function haversineEtaSeconds(meters: number, profile: RoutingProfile): number {
  const speedKmh = profile === "bike" ? 15 : 25;
  const speedMps = (speedKmh * 1000) / 3600;
  return Math.round(meters / speedMps);
}

function normalizeResult(data: {
  distanceMeters: number;
  durationSeconds: number;
  geometry?: string;
  source: "mapbox" | "osrm" | "haversine";
  approximate: boolean;
}): RouteResult {
  const distanceMeters = Math.max(0, Math.round(data.distanceMeters));
  const durationSeconds = Math.max(0, Math.round(data.durationSeconds));
  return {
    distanceMeters,
    durationSeconds,
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    etaMinutes: Math.round(durationSeconds / 60),
    geometry: data.geometry,
    polyline: data.geometry,
    source: data.source,
    cached: false,
    approximate: data.approximate,
    fromRoutingEngine: data.source !== "haversine",
  };
}

async function fetchMapboxRoute(
  points: LatLng[],
  profile: RoutingProfile,
  mapboxToken: string
): Promise<RouteResult | null> {
  const mapboxProfile = profile === "bike" ? "cycling" : "driving";
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${coords}`);
  url.searchParams.set("access_token", mapboxToken);
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "polyline");
  url.searchParams.set("steps", "false");
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ distance?: number; duration?: number; geometry?: string }>;
    };
    const route = data.routes?.[0];
    if (!route || typeof route.distance !== "number" || typeof route.duration !== "number") return null;
    return normalizeResult({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
      source: "mapbox",
      approximate: false,
    });
  } catch {
    return null;
  }
}

async function fetchOSRMRoute(
  points: LatLng[],
  profile: RoutingProfile,
  osrmBaseUrl: string
): Promise<RouteResult | null> {
  const osrmProfile = profile === "bike" ? "bike" : "driving";
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const base = osrmBaseUrl.replace(/\/$/, "");
  const url = `${base}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=polyline`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number; geometry?: string }>;
    };
    if (data.code !== "Ok") return null;
    const route = data.routes?.[0];
    if (!route || typeof route.distance !== "number" || typeof route.duration !== "number") return null;
    return normalizeResult({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
      source: "osrm",
      approximate: false,
    });
  } catch {
    return null;
  }
}

function haversinePathDistanceMeters(points: LatLng[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    sum += haversineMeters(a, b);
  }
  return sum;
}

function dbCacheKey(options: GetRouteOptions): string | null {
  // DB cache only supports simple origin->destination (no waypoints) to keep schema lean.
  if ((options.waypoints?.length ?? 0) > 0) return null;
  const profile = options.profile ?? "driving";
  const o = options.origin;
  const d = options.destination;
  const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  const raw = `${profile}:${round6(o.lat)},${round6(o.lng)}:${round6(d.lat)},${round6(d.lng)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function getDbCached(options: GetRouteOptions): Promise<RouteResult | null> {
  if (process.env.NODE_ENV === "test") return null;
  const key = dbCacheKey(options);
  if (!key) return null;
  const now = new Date();
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(routeDistanceCache)
      .where(and(eq(routeDistanceCache.cacheKey, key), gt(routeDistanceCache.expiresAt, now)))
      .limit(1);
    if (!row) return null;
    return {
      distanceMeters: Number(row.distanceMeters),
      durationSeconds: Number(row.durationSeconds),
      distanceKm: Math.round((Number(row.distanceMeters) / 1000) * 100) / 100,
      etaMinutes: Math.round(Number(row.durationSeconds) / 60),
      geometry: row.geometry ?? undefined,
      polyline: row.geometry ?? undefined,
      source: (row.provider as any) ?? "mapbox",
      cached: true,
      approximate: row.approximate ?? false,
      fromRoutingEngine: String(row.provider) !== "haversine",
    };
  } catch {
    return null;
  }
}

async function setDbCached(options: GetRouteOptions, result: RouteResult): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const key = dbCacheKey(options);
  if (!key) return;
  try {
    const db = getDb();
    const profile = options.profile ?? "driving";
    const expiresAt = new Date(Date.now() + DB_CACHE_TTL_MS);
    await db
      .insert(routeDistanceCache)
      .values({
        cacheKey: key,
        originLat: String(options.origin.lat),
        originLng: String(options.origin.lng),
        destLat: String(options.destination.lat),
        destLng: String(options.destination.lng),
        profile,
        distanceMeters: Math.round(result.distanceMeters),
        durationSeconds: Math.round(result.durationSeconds),
        geometry: result.geometry ?? result.polyline ?? null,
        provider: result.source ?? "mapbox",
        approximate: result.approximate ?? false,
        expiresAt,
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: routeDistanceCache.cacheKey,
        set: {
          distanceMeters: Math.round(result.distanceMeters),
          durationSeconds: Math.round(result.durationSeconds),
          geometry: result.geometry ?? result.polyline ?? null,
          provider: result.source ?? "mapbox",
          approximate: result.approximate ?? false,
          expiresAt,
          updatedAt: new Date(),
        },
      });
  } catch {
    // ignore cache write failures
  }
}

export async function getRoute(options: GetRouteOptions): Promise<RouteResult> {
  const profile = options.profile ?? "driving";
  const waypoints = options.waypoints ?? [];
  const points = [options.origin, ...waypoints, options.destination];
  const key = cacheKey(options);

  if (!options.skipCache) {
    const cached = await getCached(key);
    if (cached) return cached;
    const dbCached = await getDbCached(options);
    if (dbCached) {
      setCached(key, dbCached);
      return dbCached;
    }
  }

  const mapboxToken = options.mapboxToken?.trim();
  if (mapboxToken) {
    const mb = await fetchMapboxRoute(points, profile, mapboxToken);
    if (mb) {
      setCached(key, mb);
      if (!options.skipCache) await setDbCached(options, mb);
      return mb;
    }
  }

  const osrmBaseUrl = options.osrmBaseUrl?.trim();
  if (osrmBaseUrl) {
    const osrm = await fetchOSRMRoute(points, profile, osrmBaseUrl);
    if (osrm) {
      setCached(key, osrm);
      if (!options.skipCache) await setDbCached(options, osrm);
      return osrm;
    }
  }

  const distanceMeters = Math.round(haversinePathDistanceMeters(points));
  const result = normalizeResult({
    distanceMeters,
    durationSeconds: haversineEtaSeconds(distanceMeters, profile),
    source: "haversine",
    approximate: true,
  });
  setCached(key, result);
  if (!options.skipCache) await setDbCached(options, result);
  return result;
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}
