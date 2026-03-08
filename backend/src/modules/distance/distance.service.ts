/**
 * Distance calculation service — single source of truth for all apps (Customer, Rider, Merchant).
 * Two-stage design:
 *   Stage 1: Fast geographic filtering (Haversine) — used by merchant nearby RPC and as fallback.
 *   Stage 2: Real road routing (OSRM) — distance, ETA, geometry.
 * Optional in-memory cache (replace with Redis for multi-instance production).
 */

import type { LatLng, RouteResult, RoutingProfile } from "./distance.types.js";

const EARTH_RADIUS_METERS = 6_371_000;

/** Haversine distance in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const a2 =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
  return EARTH_RADIUS_METERS * c;
}

/** Haversine-based ETA: assume ~25 km/h average for driving, ~15 km/h for bike (rough). */
function haversineEtaSeconds(meters: number, profile: RoutingProfile): number {
  const speedKmh = profile === "bike" ? 15 : 25;
  const speedMps = (speedKmh * 1000) / 3600;
  return Math.round(meters / speedMps);
}

/** Round coords to 4 decimals (~11m) for cache key. */
function cacheKey(origin: LatLng, dest: LatLng, profile: RoutingProfile): string {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return `route:${profile}:${r(origin.lat)}:${r(origin.lng)}:${r(dest.lat)}:${r(dest.lng)}`;
}

/** In-memory TTL cache. For production, replace with Redis (same key shape). */
const memoryCache = new Map<
  string,
  { value: RouteResult; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): RouteResult | null {
  const entry = memoryCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key: string, value: RouteResult): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export type OSRMConfig = {
  baseUrl: string;
  /** OSRM profile: driving, bike, etc. */
  profile: string;
};

/** Build OSRM route URL. Coordinates in lon,lat order. */
function osrmRouteUrl(
  baseUrl: string,
  origin: LatLng,
  destination: LatLng,
  profile: string
): string {
  const base = baseUrl.replace(/\/$/, "");
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  return `${base}/route/v1/${profile}/${coords}?overview=full&geometries=polyline`;
}

/** Call OSRM and parse response. Returns null on failure. */
async function fetchOSRMRoute(
  origin: LatLng,
  destination: LatLng,
  profile: RoutingProfile,
  baseUrl: string
): Promise<RouteResult | null> {
  const osrmProfile = profile === "bike" ? "bike" : "driving";
  const url = osrmRouteUrl(baseUrl, origin, destination, osrmProfile);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates?: number[][]; encoded?: string };
      }>;
    };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const r = data.routes[0];
    const distanceMeters = Math.round(r.distance ?? 0);
    const durationSeconds = Math.round(r.duration ?? 0);
    const geometry =
      typeof r.geometry === "object" && r.geometry
        ? (r.geometry as { encoded?: string }).encoded ?? undefined
        : undefined;
    return {
      distanceMeters,
      durationSeconds,
      distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
      etaMinutes: Math.round(durationSeconds / 60),
      geometry,
      fromRoutingEngine: true,
    };
  } catch {
    return null;
  }
}

export type GetRouteOptions = {
  origin: LatLng;
  destination: LatLng;
  profile?: RoutingProfile;
  /** OSRM base URL (e.g. https://router.project-osrm.org). If empty, use Haversine only. */
  osrmBaseUrl?: string;
  /** If true, skip cache (e.g. for fresh ETA). */
  skipCache?: boolean;
};

/**
 * Get route distance and ETA. Uses cache when available.
 * Stage 2: Try OSRM. On failure or missing config, fallback to Stage 1 (Haversine).
 */
export async function getRoute(options: GetRouteOptions): Promise<RouteResult> {
  const {
    origin,
    destination,
    profile = "driving",
    osrmBaseUrl,
    skipCache = false,
  } = options;

  const key = cacheKey(origin, destination, profile);
  if (!skipCache) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  if (osrmBaseUrl?.trim()) {
    const route = await fetchOSRMRoute(
      origin,
      destination,
      profile,
      osrmBaseUrl.trim()
    );
    if (route) {
      setCached(key, route);
      return route;
    }
  }

  // Fallback: Haversine
  const distanceMeters = Math.round(haversineMeters(origin, destination));
  const durationSeconds = haversineEtaSeconds(distanceMeters, profile);
  const result: RouteResult = {
    distanceMeters,
    durationSeconds,
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    etaMinutes: Math.round(durationSeconds / 60),
    fromRoutingEngine: false,
  };
  setCached(key, result);
  return result;
}

/**
 * Batch: Haversine only (fast). Use for Stage 1 filtering of many origins/destinations.
 * For real road distance/ETA, call getRoute per pair (with OSRM + cache).
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}
