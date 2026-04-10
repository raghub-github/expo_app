/**
 * Centralized distance engine:
 * - Mapbox Directions (primary)
 * - OSRM (secondary fallback)
 * - Haversine (last-resort approximate fallback)
 */

import type { LatLng, RouteResult, RoutingProfile } from "./distance.types.js";

const EARTH_RADIUS_METERS = 6_371_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export type GetRouteOptions = {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  profile?: RoutingProfile;
  mapboxToken?: string;
  osrmBaseUrl?: string;
  skipCache?: boolean;
};

const memoryCache = new Map<string, { value: RouteResult; expiresAt: number }>();

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

function getCached(key: string): RouteResult | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true };
}

function setCached(key: string, value: RouteResult): void {
  memoryCache.set(key, { value: { ...value, cached: false }, expiresAt: Date.now() + CACHE_TTL_MS });
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

export async function getRoute(options: GetRouteOptions): Promise<RouteResult> {
  const profile = options.profile ?? "driving";
  const waypoints = options.waypoints ?? [];
  const points = [options.origin, ...waypoints, options.destination];
  const key = cacheKey(options);

  if (!options.skipCache) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  const mapboxToken = options.mapboxToken?.trim();
  if (mapboxToken) {
    const mb = await fetchMapboxRoute(points, profile, mapboxToken);
    if (mb) {
      setCached(key, mb);
      return mb;
    }
  }

  const osrmBaseUrl = options.osrmBaseUrl?.trim();
  if (osrmBaseUrl) {
    const osrm = await fetchOSRMRoute(points, profile, osrmBaseUrl);
    if (osrm) {
      setCached(key, osrm);
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
  return result;
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}
