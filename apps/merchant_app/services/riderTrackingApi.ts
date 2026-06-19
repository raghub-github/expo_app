import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl.replace(/\/+$/, "");

export type MerchantRiderTrackingLocation = {
  latitude: number;
  longitude: number;
  heading_degrees: number | null;
  updated_at: string;
  source: "order_tracking" | "live_location";
};

export type MerchantRiderTrackingTrailPoint = {
  latitude: number;
  longitude: number;
  created_at: string;
};

export type MerchantMapPin = {
  latitude: number;
  longitude: number;
};

export type MerchantRiderApproach = {
  remaining_distance_m: number;
  eta_minutes: number;
  source: "straight_line" | "route";
};

export type MerchantRiderTrackingPayload = {
  rider: {
    name: string | null;
    mobile: string | null;
    selfie_url: string | null;
    assignment_status: string | null;
  };
  rider_display_variant?:
    | "on_the_way"
    | "arrived"
    | "picked_up"
    | "delivered"
    | "cancelled"
    | "rto";
  location: MerchantRiderTrackingLocation | null;
  trail: MerchantRiderTrackingTrailPoint[];
  store: MerchantMapPin | null;
  store_name: string | null;
  pickup: MerchantMapPin | null;
  drop: MerchantMapPin | null;
  approach: MerchantRiderApproach | null;
};

export const MERCHANT_RIDER_TRACKING_POLL_MS = 2000;

export async function fetchMerchantRiderTracking(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<MerchantRiderTrackingPayload> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/rider-tracking`,
    token
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Could not load rider location");
  }
  return (await res.json()) as MerchantRiderTrackingPayload;
}
