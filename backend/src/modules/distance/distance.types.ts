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
  /** Encoded polyline for map display; optional */
  geometry?: string;
  polyline?: string;
  /** Which provider produced the route. */
  source: "mapbox" | "osrm" | "haversine";
  /** true when result came from cache */
  cached: boolean;
  /** true when response is a fallback approximation */
  approximate: boolean;
  /** Backward-compat field: true when provider is not haversine fallback */
  fromRoutingEngine: boolean;
};

export type DistanceRouteRequest = {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  profile?: RoutingProfile;
};
