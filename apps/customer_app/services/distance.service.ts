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
  polyline?: string;
  source?: "mapbox" | "osrm" | "haversine";
  fromRoutingEngine: boolean;
  approximate?: boolean;
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

/**
 * Canonical store delivery quote — single source of truth for:
 *   distance_km, duration_min, delivery_fee, delivery_gst, final_delivery_fee, serviceable
 *
 * Use this on EVERY screen that displays distance/ETA/delivery fee for a store:
 *   - home/store listing
 *   - search result
 *   - store details
 *   - cart
 *   - checkout
 *   - order details
 *   - live tracking
 *
 * Pass `addressId` for the customer's selected delivery address (canonical),
 * or `drop` coords for guest/list-before-address flows. Both routes hit the same
 * backend engine so numbers stay identical across pages.
 */
export type StoreDeliveryQuote = {
  store_id: string;
  actor: "customer" | "rider";
  distance_km: number;
  duration_min: number;
  delivery_fee: number;
  delivery_gst: number;
  final_delivery_fee: number;
  serviceable: boolean;
  unserviceable_reason?: "out_of_range" | "store_inactive" | "no_delivery_slab" | "no_geo_match" | null;
  service_radius_km: number;
  source: "mapbox" | "osrm" | "haversine";
  cached: boolean;
  approximate: boolean;
  pricing_engine: "slab_geo" | "fallback_slab" | "fallback_per_km" | "no_slab_configured" | "no_geo_match" | "slab_invalid";
  /** Geo level at which slabs were resolved (pincode/post_office/district/region/state). */
  applied_geo_level?: string | null;
  slab_quote?: unknown;
  base_duration_min?: number;
  weather_delay_minutes?: number;
  weather_adjusted_duration_min?: number;
  weather_impact_label?: string | null;
  weather_severity?: string | null;
  weather_chip_label?: string | null;
  weather_show_impact?: boolean;
  customer_pricing?: {
    service_type: "food" | "parcel" | "ride";
    pricing_source: string;
    distance_km: number | null;
    base_fare: number;
    distance_charge: number;
    delivery_fee: number;
    min_charge_applied?: number;
    taxes?: number;
  };
};

export async function getStoreDeliveryQuote(params: {
  storeId: string;
  addressId?: number | null;
  drop?: { lat: number; lng: number; pincode?: string | null; city?: string | null } | null;
  actor?: "customer" | "rider";
  serviceType?: "FOOD" | "PARCEL" | "RIDE";
  skipCache?: boolean;
}): Promise<StoreDeliveryQuote> {
  const body: Record<string, unknown> = {
    storeId: params.storeId,
    actor: params.actor ?? "customer",
    serviceType: params.serviceType ?? "FOOD",
    skipCache: params.skipCache ?? false,
  };
  if (params.addressId != null) body.addressId = params.addressId;
  if (params.drop) body.drop = params.drop;
  const { data } = await api.post<StoreDeliveryQuote>(`${DISTANCE_PREFIX}/store-quote`, body);
  return data;
}
