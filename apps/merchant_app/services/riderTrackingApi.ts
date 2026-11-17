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
  source: "straight_line" | "route" | "server_eta";
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

/** HTTP fallback only while WS is down — keep ≥10s to avoid radio heat. */
export const MERCHANT_RIDER_TRACKING_POLL_MS = 10_000;
/** Longer than food-orders — Android ~6 conn/host; tracking often waits behind board polls. */
const RIDER_TRACKING_TIMEOUT_MS = 35_000;

export async function fetchMerchantRiderTracking(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<MerchantRiderTrackingPayload> {
  const url = `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/rider-tracking`;

  const once = async () => {
    const res = await authFetch(url, token, { timeoutMs: RIDER_TRACKING_TIMEOUT_MS });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "Could not load rider location");
    }
    return (await res.json()) as MerchantRiderTrackingPayload;
  };

  try {
    return await once();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (!/timed out|timeout|network request failed/i.test(msg)) throw e;
    // One retry — first attempt often loses the socket race to food-orders.
    await new Promise((r) => setTimeout(r, 600));
    return once();
  }
}
