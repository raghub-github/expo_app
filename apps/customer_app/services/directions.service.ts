/**
 * Road route polylines for ride map — never renders a straight-line fallback.
 * Route + ETA are computed per selected vehicle (bike / auto / cab / travel).
 */

import { getConfig } from "@/config/env";
import { getRoute, type LatLng as ApiLatLng } from "@/services/distance.service";

export type LatLng = { latitude: number; longitude: number };

export type RideRouteProfile = "driving" | "bike";

export type RouteOptimizeFor = "fastest_time" | "shortest_distance";

export type VehicleRouteConfig = {
  mapboxProfiles: string[];
  optimizeFor: RouteOptimizeFor;
  /** Scales raw routing duration for this vehicle in Indian traffic. */
  durationScale: number;
  backendProfile: RideRouteProfile;
};

export type CalculatedRoute = {
  coordinates: LatLng[];
  distanceKm: number;
  /** Raw routing engine duration before vehicle scaling. */
  durationSeconds: number;
  etaMinutes: number;
  source: "mapbox" | "osrm" | "backend";
  vehicleId: string;
};

/** Single canonical profile for fare, ETA, and ride distance (pickup → drop). */
export const CANONICAL_RIDE_ROUTE_VEHICLE_ID = "bike";

const OSRM_DRIVING = "https://router.project-osrm.org/route/v1/driving";

/** Per-vehicle routing — Rapido-style: 2W shortest/fast, cars traffic-fastest. */
const VEHICLE_ROUTE_CONFIG: Record<string, VehicleRouteConfig> = {
  bike: {
    mapboxProfiles: ["driving"],
    optimizeFor: "shortest_distance",
    durationScale: 0.72,
    backendProfile: "bike",
  },
  "bike-lite": {
    mapboxProfiles: ["driving"],
    optimizeFor: "shortest_distance",
    durationScale: 0.76,
    backendProfile: "bike",
  },
  auto: {
    mapboxProfiles: ["driving-traffic", "driving"],
    optimizeFor: "fastest_time",
    durationScale: 1.18,
    backendProfile: "driving",
  },
  "cab-economy": {
    mapboxProfiles: ["driving-traffic", "driving"],
    optimizeFor: "fastest_time",
    durationScale: 1.0,
    backendProfile: "driving",
  },
  "cab-premium": {
    mapboxProfiles: ["driving-traffic", "driving"],
    optimizeFor: "fastest_time",
    durationScale: 0.96,
    backendProfile: "driving",
  },
  travel: {
    mapboxProfiles: ["driving"],
    optimizeFor: "fastest_time",
    durationScale: 0.9,
    backendProfile: "driving",
  },
};

const DEFAULT_VEHICLE_CONFIG = VEHICLE_ROUTE_CONFIG["cab-economy"]!;

export function getVehicleRouteConfig(rideId: string): VehicleRouteConfig {
  return VEHICLE_ROUTE_CONFIG[rideId] ?? DEFAULT_VEHICLE_CONFIG;
}

/** @deprecated Use getVehicleRouteConfig(rideId).backendProfile */
export function rideProfileForVehicle(rideId: string): RideRouteProfile {
  return getVehicleRouteConfig(rideId).backendProfile;
}

/** Decode Google/Mapbox encoded polyline (precision 5). */
export function decodePolyline(encoded: string): LatLng[] {
  const coordinates: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return coordinates;
}

function isRoadGeometry(coords: LatLng[]): boolean {
  return coords.length >= 3;
}

function toApiPoint(p: LatLng): ApiLatLng {
  return { lat: p.latitude, lng: p.longitude };
}

function coordsFromEncodedPolyline(encoded?: string | null): LatLng[] {
  if (!encoded?.trim()) return [];
  try {
    return decodePolyline(encoded);
  } catch {
    return [];
  }
}

type RawRoute = { distance?: number; duration?: number; geometry?: string };

function vehicleEtaMinutes(durationSeconds: number, config: VehicleRouteConfig): number {
  const scaled = Math.max(60, durationSeconds * config.durationScale);
  return Math.max(1, Math.round(scaled / 60));
}

function compareRoutes(
  a: RawRoute,
  b: RawRoute,
  optimizeFor: RouteOptimizeFor,
  durationScale: number
): number {
  if (optimizeFor === "shortest_distance") {
    const dist = (a.distance ?? 0) - (b.distance ?? 0);
    if (dist !== 0) return dist;
    return (a.duration ?? 0) * durationScale - (b.duration ?? 0) * durationScale;
  }
  const timeA = (a.duration ?? 0) * durationScale;
  const timeB = (b.duration ?? 0) * durationScale;
  if (timeA !== timeB) return timeA - timeB;
  return (a.distance ?? 0) - (b.distance ?? 0);
}

function pickBestRoute(
  routes: RawRoute[],
  config: VehicleRouteConfig
): RawRoute | null {
  const valid = routes.filter(
    (route) =>
      typeof route.distance === "number" &&
      typeof route.duration === "number" &&
      route.geometry?.trim()
  );
  if (!valid.length) return null;
  valid.sort((a, b) => compareRoutes(a, b, config.optimizeFor, config.durationScale));
  return valid[0] ?? null;
}

function rawRouteToCalculated(
  route: RawRoute,
  coordinates: LatLng[],
  config: VehicleRouteConfig,
  source: CalculatedRoute["source"],
  vehicleId: string
): CalculatedRoute | null {
  if (!isRoadGeometry(coordinates) || route.distance == null || route.duration == null) {
    return null;
  }
  return {
    coordinates,
    distanceKm: route.distance / 1000,
    durationSeconds: Math.max(1, Math.round(route.duration)),
    etaMinutes: vehicleEtaMinutes(route.duration, config),
    source,
    vehicleId,
  };
}

function isBetterRoute(
  candidate: CalculatedRoute,
  current: CalculatedRoute | null,
  config: VehicleRouteConfig
): boolean {
  if (!current) return true;
  if (config.optimizeFor === "shortest_distance") {
    if (candidate.distanceKm !== current.distanceKm) {
      return candidate.distanceKm < current.distanceKm;
    }
    return candidate.etaMinutes < current.etaMinutes;
  }
  if (candidate.etaMinutes !== current.etaMinutes) {
    return candidate.etaMinutes < current.etaMinutes;
  }
  return candidate.distanceKm < current.distanceKm;
}

async function fetchMapboxPolyline(
  points: LatLng[],
  rideId: string,
  config: VehicleRouteConfig
): Promise<CalculatedRoute | null> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken || points.length < 2) return null;

  let best: CalculatedRoute | null = null;
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");

  for (const mapboxProfile of config.mapboxProfiles) {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${coords}` +
      `?access_token=${encodeURIComponent(mapboxAccessToken)}` +
      `&alternatives=true&overview=full&geometries=polyline&steps=false&language=en`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { routes?: RawRoute[] };
      const route = pickBestRoute(data.routes ?? [], config);
      const coordinates = coordsFromEncodedPolyline(route?.geometry);
      if (!route) continue;
      const candidate = rawRouteToCalculated(route, coordinates, config, "mapbox", rideId);
      if (candidate && isBetterRoute(candidate, best, config)) {
        best = candidate;
      }
    } catch {
      // try next profile
    }
  }

  return best;
}

async function fetchOsrmPolyline(
  points: LatLng[],
  rideId: string,
  config: VehicleRouteConfig
): Promise<CalculatedRoute | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const url =
    `${OSRM_DRIVING}/${coords}?overview=full&geometries=polyline&alternatives=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: RawRoute[];
    };
    if (data.code !== "Ok") return null;
    const route = pickBestRoute(data.routes ?? [], config);
    const coordinates = coordsFromEncodedPolyline(route?.geometry);
    if (!route) return null;
    return rawRouteToCalculated(route, coordinates, config, "osrm", rideId);
  } catch {
    return null;
  }
}

async function fetchBackendPolyline(
  points: LatLng[],
  rideId: string,
  config: VehicleRouteConfig,
  skipCache = false
): Promise<CalculatedRoute | null> {
  if (points.length < 2) return null;
  try {
    const result = await getRoute({
      origin: toApiPoint(points[0]),
      destination: toApiPoint(points[points.length - 1]),
      profile: config.backendProfile,
      skipCache,
    });
    if (!result.fromRoutingEngine || result.approximate) return null;
    const encoded = result.geometry ?? result.polyline;
    const coordinates = coordsFromEncodedPolyline(encoded);
    if (!isRoadGeometry(coordinates)) return null;
    const rawDuration = result.durationSeconds ?? result.etaMinutes * 60;
    return {
      coordinates,
      distanceKm: result.distanceKm,
      durationSeconds: Math.max(1, Math.round(rawDuration)),
      etaMinutes: vehicleEtaMinutes(rawDuration, config),
      source: "backend",
      vehicleId: rideId,
    };
  } catch {
    return null;
  }
}

/**
 * Best real road route for the full path (pickup → stops → drop) for one vehicle.
 * Mapbox first, then OSRM, then backend — never a straight-line fallback.
 */
export async function getCalculatedRouteCoordinates(
  points: LatLng[],
  rideId: string,
  options?: { skipCache?: boolean }
): Promise<CalculatedRoute | null> {
  if (points.length < 2) return null;
  const config = getVehicleRouteConfig(rideId);

  const mapbox = await fetchMapboxPolyline(points, rideId, config);
  if (mapbox) return mapbox;

  const osrm = await fetchOsrmPolyline(points, rideId, config);
  if (osrm) return osrm;

  const backend = await fetchBackendPolyline(points, rideId, config, options?.skipCache === true);
  if (backend) return backend;

  return null;
}

/** Multi-stop route in a single best-path request (not stitched straight segments). */
export async function getCalculatedRouteWithStops(
  pickup: LatLng,
  stops: LatLng[],
  drop: LatLng,
  rideId: string,
  options?: { skipCache?: boolean }
): Promise<CalculatedRoute | null> {
  const path = [pickup, ...stops.filter(Boolean), drop];
  return getCalculatedRouteCoordinates(path, rideId, options);
}

/**
 * Canonical pickup → drop route used for fare, ETA, and ride distance everywhere.
 * Never varies by selected vehicle — recalculate only when pickup/drop/stops change.
 */
export async function resolveCanonicalRideRoute(
  pickup: LatLng,
  stops: LatLng[],
  drop: LatLng,
  options?: { skipCache?: boolean }
): Promise<CalculatedRoute | null> {
  return getCalculatedRouteWithStops(
    pickup,
    stops,
    drop,
    CANONICAL_RIDE_ROUTE_VEHICLE_ID,
    options
  );
}

/** @deprecated Use getCalculatedRouteCoordinates — no straight-line fallback. */
export async function getRouteCoordinates(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const route = await getCalculatedRouteCoordinates([from, to], "cab-economy");
  return route?.coordinates ?? [];
}
