/**
 * Post-pickup cancellation: order closed after a rider had already picked up.
 */

import type { ApiFoodOrder, FoodOrderRiderLogEntry } from "@/services/ordersApi";
import { apiStatusToStage } from "@/hooks/useOrders";

export function isPostPickupCancellation(
  order: ApiFoodOrder | null | undefined,
  riders: FoodOrderRiderLogEntry[] = []
): boolean {
  if (!order) return false;
  const stage = apiStatusToStage(order.order_status);
  if (stage !== "rejected" && stage !== "rto") return false;

  if (order.cancellation_compensation?.scenario_code === "ORDER_PICKED_UP") {
    return true;
  }
  if (order.rider_picked_up_at?.trim()) return true;
  if (order.handed_over_to_rider_at?.trim()) return true;
  if ((order.rider_display_variant ?? "").toLowerCase() === "picked_up") return true;

  return riders.some((r) => Boolean(r.picked_up_at?.trim()));
}

/** Prefer the assignment that actually picked up (even if later cancelled). */
export function resolvePostPickupRider(
  riders: FoodOrderRiderLogEntry[],
  order?: ApiFoodOrder | null
): FoodOrderRiderLogEntry | null {
  const withPickup = [...riders]
    .filter((r) => Boolean(r.picked_up_at?.trim()))
    .sort((a, b) => {
      const ta = Date.parse(a.picked_up_at ?? "") || 0;
      const tb = Date.parse(b.picked_up_at ?? "") || 0;
      return tb - ta;
    });
  if (withPickup[0]) return withPickup[0];

  if (order?.rider_id != null) {
    const byId = riders.find((r) => Number(r.rider_id) === Number(order.rider_id));
    if (byId) return byId;
  }

  return riders[0] ?? null;
}
