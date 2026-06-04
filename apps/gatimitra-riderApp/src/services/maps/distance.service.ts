/**
 * Road distance + polyline via backend — same engine as customer app checkout/ETA.
 */

import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { postJson } from "@/src/services/http";

export type RoutePoint = { lat: number; lng: number };

export type BackendRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  etaMinutes: number;
  geometry?: string;
  polyline?: string;
  source?: "mapbox" | "osrm" | "haversine";
  fromRoutingEngine: boolean;
  approximate?: boolean;
};

export async function fetchBackendRoute(params: {
  origin: RoutePoint;
  destination: RoutePoint;
  profile?: "driving" | "bike";
  skipCache?: boolean;
}): Promise<BackendRouteResult | null> {
  try {
    const cfg = getRiderAppConfig();
    const url = resolveUrlForDevice(`${cfg.apiBaseUrl}/v1/distance/route`);
    return await postJson<BackendRouteResult>(url, {
      origin: params.origin,
      destination: params.destination,
      profile: params.profile ?? "driving",
      skipCache: params.skipCache ?? false,
    });
  } catch {
    return null;
  }
}
