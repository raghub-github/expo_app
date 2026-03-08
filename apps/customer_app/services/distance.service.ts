/**
 * Distance service — all distance/ETA requests go through the backend.
 * Do NOT implement Haversine or routing in the app; use this API only.
 */

import api from "./api";

export type LatLng = { lat: number; lng: number };

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  etaMinutes: number;
  geometry?: string;
  fromRoutingEngine: boolean;
};

const DISTANCE_PREFIX = "/v1/distance";

/**
 * Get road distance and ETA between two points.
 * Backend uses OSRM when configured, else Haversine fallback.
 */
export async function getRoute(params: {
  origin: LatLng;
  destination: LatLng;
  profile?: "driving" | "bike";
  skipCache?: boolean;
}): Promise<RouteResult> {
  const { data } = await api.post<RouteResult>(`${DISTANCE_PREFIX}/route`, {
    origin: params.origin,
    destination: params.destination,
    profile: params.profile ?? "driving",
    skipCache: params.skipCache ?? false,
  });
  return data;
}
