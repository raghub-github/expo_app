// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
/**
 * Road route polylines for rider navigation — never renders a straight-line fallback.
 */

import { getRiderAppConfig } from "@/src/config/env";
import { formatAlternativeRouteLabel } from "@/src/lib/navigation-alternative-routes";
import { fetchBackendRoute } from "@/src/services/maps/distance.service";

export type LatLng = { latitude: number; longitude: number };

export type NavigationStep = {
  instruction: string;
  maneuverType: string;
  modifier?: string;
  distanceM: number;
  durationS: number;
};

export type NavigationAlternativeRoute = {
  coordinates: LatLng[];
  distanceKm: number;
  etaMinutes: number;
  /** Whole minutes slower than the primary (fastest) route. */
  deltaMinutes: number;
  label: string;
};

export type NavigationRoute = {
  coordinates: LatLng[];
  distanceKm: number;
  etaMinutes: number;
  source: "mapbox" | "osrm" | "backend";
  /** Turn-by-turn steps from Mapbox (when available). */
  steps?: NavigationStep[];
  /** Other road options from Mapbox/OSRM (e.g. "2 min slower"). */
  alternatives?: NavigationAlternativeRoute[];
};

const OSRM_DRIVING = "https://router.project-osrm.org/route/v1/driving";

type RouteProfile = {
  mapboxProfiles: string[];
  durationScale: number;
};

const PROFILES: Record<string, RouteProfile> = {
  bike: { mapboxProfiles: ["driving"], durationScale: 0.72 },
  "bike-lite": { mapboxProfiles: ["driving"], durationScale: 0.76 },
  auto: { mapboxProfiles: ["driving-traffic", "driving"], durationScale: 1.18 },
  ev_auto: { mapboxProfiles: ["driving-traffic", "driving"], durationScale: 1.18 },
  "cab-economy": { mapboxProfiles: ["driving-traffic", "driving"], durationScale: 1.0 },
  "cab-premium": { mapboxProfiles: ["driving-traffic", "driving"], durationScale: 0.96 },
  travel: { mapboxProfiles: ["driving"], durationScale: 0.9 },
};

const DEFAULT_PROFILE = PROFILES["cab-economy"]!;

export function profileForRideType(rideType?: string): RouteProfile {
  if (!rideType) return DEFAULT_PROFILE;
  return PROFILES[rideType] ?? DEFAULT_PROFILE;
}

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
  return coords.length >= 2;
}

function backendProfileForRideType(rideType?: string): "bike" | "driving" {
  const rt = String(rideType ?? "").trim().toLowerCase();
  if (rt === "bike" || rt === "bike-lite") return "bike";
  return "driving";
}

function coordsFromEncodedPolyline(encoded?: string | null): LatLng[] {
  if (!encoded?.trim()) return [];
  try {
    return decodePolyline(encoded);
  } catch {
    return [];
  }
}

type RawRoute = {
  distance?: number;
  duration?: number;
  geometry?: string;
  legs?: Array<{
    steps?: Array<{
      maneuver?: { type?: string; modifier?: string; instruction?: string };
      distance?: number;
      duration?: number;
    }>;
  }>;
};

function parseMapboxSteps(route: RawRoute): NavigationStep[] {
  const steps = route.legs?.[0]?.steps ?? [];
  return steps
    .map((s) => {
      const instruction = s.maneuver?.instruction?.trim();
      if (!instruction) return null;
      return {
        instruction,
        maneuverType: s.maneuver?.type ?? "continue",
        modifier: s.maneuver?.modifier,
        distanceM: typeof s.distance === "number" ? s.distance : 0,
        durationS: typeof s.duration === "number" ? s.duration : 0,
      };
    })
    .filter((s): s is NavigationStep => s != null);
}

type ParsedRouteCandidate = {
  raw: RawRoute;
  coordinates: LatLng[];
  distanceKm: number;
  etaMinutes: number;
  durationScaled: number;
  steps?: NavigationStep[];
};

function buildNavigationFromRawRoutes(
  routes: RawRoute[],
  profile: RouteProfile,
  source: NavigationRoute["source"]
): NavigationRoute | null {
  const candidates: ParsedRouteCandidate[] = [];

  for (const route of routes) {
    if (typeof route.distance !== "number" || typeof route.duration !== "number") continue;
    if (!route.geometry?.trim()) continue;
    const coordinates = coordsFromEncodedPolyline(route.geometry);
    if (!isRoadGeometry(coordinates)) continue;
    const durationScaled = (route.duration ?? 0) * profile.durationScale;
    candidates.push({
      raw: route,
      coordinates,
      distanceKm: (route.distance ?? 0) / 1000,
      etaMinutes: Math.max(1, Math.round(durationScaled / 60)),
      durationScaled,
      steps: source === "mapbox" ? parseMapboxSteps(route) : undefined,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.durationScaled - b.durationScaled);
  const primary = candidates[0]!;
  const alternatives: NavigationAlternativeRoute[] = [];

  for (let i = 1; i < candidates.length && alternatives.length < 2; i++) {
    const alt = candidates[i]!;
    if (alt.raw.geometry === primary.raw.geometry) continue;
    const deltaMinutes = Math.max(
      0,
      Math.round((alt.durationScaled - primary.durationScaled) / 60)
    );
    const label = formatAlternativeRouteLabel(deltaMinutes);
    if (!label) continue;
    alternatives.push({
      coordinates: alt.coordinates,
      distanceKm: alt.distanceKm,
      etaMinutes: alt.etaMinutes,
      deltaMinutes,
      label,
    });
  }

  return {
    coordinates: primary.coordinates,
    distanceKm: primary.distanceKm,
    etaMinutes: primary.etaMinutes,
    source,
    steps: primary.steps,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

async function fetchMapboxRoute(
  from: LatLng,
  to: LatLng,
  profile: RouteProfile
): Promise<NavigationRoute | null> {
  const { mapboxToken } = getRiderAppConfig();
  if (!mapboxToken) return null;

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  let best: NavigationRoute | null = null;

  for (const mapboxProfile of profile.mapboxProfiles) {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${coords}` +
      `?access_token=${encodeURIComponent(mapboxToken)}` +
      `&alternatives=true&overview=full&geometries=polyline&steps=true&banner_instructions=false&language=en`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { routes?: RawRoute[] };
      const candidate = buildNavigationFromRawRoutes(data.routes ?? [], profile, "mapbox");
      if (!candidate) continue;
      if (!best || candidate.etaMinutes < best.etaMinutes) best = candidate;
    } catch {
      // try next profile
    }
  }

  return best;
}

async function fetchOsrmRoute(
  from: LatLng,
  to: LatLng,
  profile: RouteProfile
): Promise<NavigationRoute | null> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_DRIVING}/${coords}?overview=full&geometries=polyline&alternatives=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { code?: string; routes?: RawRoute[] };
    if (data.code !== "Ok") return null;
    return buildNavigationFromRawRoutes(data.routes ?? [], profile, "osrm");
  } catch {
    return null;
  }
}

async function fetchBackendNavigationRoute(
  from: LatLng,
  to: LatLng,
  rideType?: string
): Promise<NavigationRoute | null> {
  const profile = profileForRideType(rideType);
  const data = await fetchBackendRoute({
    origin: { lat: from.latitude, lng: from.longitude },
    destination: { lat: to.latitude, lng: to.longitude },
    profile: backendProfileForRideType(rideType),
  });
  if (!data?.fromRoutingEngine || data.approximate) return null;

  const coordinates = coordsFromEncodedPolyline(data.geometry ?? data.polyline);
  if (!isRoadGeometry(coordinates)) return null;

  const durationSeconds =
    data.durationSeconds > 0 ? data.durationSeconds : Math.max(60, data.etaMinutes * 60);

  return {
    coordinates,
    distanceKm: data.distanceKm > 0 ? data.distanceKm : data.distanceMeters / 1000,
    etaMinutes: Math.max(1, Math.round((durationSeconds * profile.durationScale) / 60)),
    source: "backend",
  };
}

/** Rider → pickup road route. Returns null if no road geometry available. */
export async function getNavigationRouteToPickup(
  from: LatLng,
  to: LatLng,
  rideType?: string
): Promise<NavigationRoute | null> {
  const profile = profileForRideType(rideType);
  const mapbox = await fetchMapboxRoute(from, to, profile);
  if (mapbox) return mapbox;

  const backend = await fetchBackendNavigationRoute(from, to, rideType);
  if (backend) return backend;

  return fetchOsrmRoute(from, to, profile);
}

export function latLngFromRider(lat: number, lng: number): LatLng {
  return { latitude: lat, longitude: lng };
}

/** Approximate distance in meters — UI hint only, not for routing. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
