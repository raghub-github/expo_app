/**
 * Distance module types.
 * Used by Customer, Rider, and Merchant apps via backend API only.
 */

export type RoutingProfile = "driving" | "bike";

export type LatLng = { lat: number; lng: number };

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  etaMinutes: number;
  /** Encoded polyline (e.g. OSRM format) for map display; optional */
  geometry?: string;
  /** Whether result is from routing engine (true) or Haversine fallback (false) */
  fromRoutingEngine: boolean;
};

export type DistanceRouteRequest = {
  origin: LatLng;
  destination: LatLng;
  profile?: RoutingProfile;
};
