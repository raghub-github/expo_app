/**
 * Single source of truth for merchant-facing rider phase (Partner Site + Merchant App).
 * All clients should use these resolved fields from the API — do not infer from GPS alone.
 */

export type RiderDisplayVariant =
  | "on_the_way"
  | "arrived"
  | "picked_up"
  | "delivered"
  | "cancelled"
  | "rto";

export type RiderMerchantDisplayInput = {
  order_status: string;
  core_status?: string | null;
  current_status?: string | null;
  reached_merchant_at?: string | null;
  rider_reached_pickup_at?: string | null;
  rider_picked_up_at?: string | null;
  pickup_wait_seconds?: number | null;
  rider_assignment_status?: string | null;
};

export function resolveReachedMerchantAt(input: RiderMerchantDisplayInput): string | null {
  const fromAssignment = input.reached_merchant_at?.trim() || null;
  if (fromAssignment) return fromAssignment;
  const fromFood = input.rider_reached_pickup_at?.trim() || null;
  if (fromFood) return fromFood;
  return null;
}

export function hasRiderReachedMerchant(input: RiderMerchantDisplayInput): boolean {
  if (resolveReachedMerchantAt(input)) return true;

  const core = String(input.core_status ?? "")
    .trim()
    .toLowerCase();
  if (core === "reached_store") return true;

  const cur = String(input.current_status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (cur === "RIDER_AT_PICKUP") return true;

  const assign = String(input.rider_assignment_status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (
    assign === "REACHED_MERCHANT" ||
    assign === "AT_PICKUP" ||
    assign === "RIDER_AT_PICKUP"
  ) {
    return true;
  }

  return false;
}

export function resolveRiderDisplayVariant(input: RiderMerchantDisplayInput): RiderDisplayVariant {
  const st = String(input.order_status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (st === "DELIVERED") return "delivered";
  if (st === "CANCELLED") return "cancelled";
  if (st === "RTO") return "rto";
  if (input.rider_picked_up_at || st === "OUT_FOR_DELIVERY" || st === "PICKED_UP") {
    return "picked_up";
  }
  if (hasRiderReachedMerchant(input)) return "arrived";
  return "on_the_way";
}

export function riderEnRouteToMerchant(input: RiderMerchantDisplayInput): boolean {
  return resolveRiderDisplayVariant(input) === "on_the_way";
}

export function resolveRiderStoreWaitState(input: RiderMerchantDisplayInput): {
  anchorAt: string | null;
  live: boolean;
  finalizedSeconds: number | null;
} {
  const anchorAt = resolveReachedMerchantAt(input);
  const pickedUpAt = input.rider_picked_up_at?.trim() || null;

  if (!anchorAt) {
    return { anchorAt: null, live: false, finalizedSeconds: null };
  }

  if (!pickedUpAt) {
    return { anchorAt, live: true, finalizedSeconds: null };
  }

  const finalizedFromDb =
    input.pickup_wait_seconds != null && Number.isFinite(input.pickup_wait_seconds)
      ? Math.max(0, Math.floor(input.pickup_wait_seconds))
      : null;

  if (finalizedFromDb != null) {
    return { anchorAt, live: false, finalizedSeconds: finalizedFromDb };
  }

  const reachedMs = new Date(anchorAt).getTime();
  const pickedMs = new Date(pickedUpAt).getTime();
  if (Number.isFinite(reachedMs) && Number.isFinite(pickedMs)) {
    return {
      anchorAt,
      live: false,
      finalizedSeconds: Math.max(0, Math.floor((pickedMs - reachedMs) / 1000)),
    };
  }

  return { anchorAt, live: false, finalizedSeconds: null };
}
