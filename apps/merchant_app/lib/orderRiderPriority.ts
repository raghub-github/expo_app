import {
  FOOD_RIDER_FREE_WAIT_SECONDS,
  riderWaitIsPriority,
} from "@/lib/riderFreeWait";
import { resolveRiderCardVariant } from "@/lib/riderMerchantArrivalDisplay";
import type { OrderRecord } from "@/hooks/useOrders";

/** PRIORITY strip when rider free-wait expired (API flag or live elapsed). */
export function orderShowsRiderPriority(order: OrderRecord, nowMs?: number): boolean {
  if (order.riderWaitPriority === true) return true;
  if (resolveRiderCardVariant(order) !== "arrived") return false;
  if (order.riderPickedUpAt || order.status === "picked_up") return false;
  const free =
    order.riderFreeWaitSeconds != null && Number.isFinite(order.riderFreeWaitSeconds)
      ? Math.max(0, Math.floor(order.riderFreeWaitSeconds))
      : FOOD_RIDER_FREE_WAIT_SECONDS;
  const anchor = order.riderStoreWaitAnchorAt ?? order.reachedMerchantAt ?? order.riderReachedAt;
  if (!anchor) return false;
  if (order.riderStoreWaitLive === true && nowMs != null) {
    const anchorMs = new Date(anchor).getTime();
    if (!Number.isFinite(anchorMs)) return false;
    const elapsed = Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
    return riderWaitIsPriority({ arrived: true, elapsedSeconds: elapsed, freeWaitSeconds: free });
  }
  if (order.pickupWaitSeconds != null) {
    return riderWaitIsPriority({
      arrived: true,
      elapsedSeconds: order.pickupWaitSeconds,
      freeWaitSeconds: free,
    });
  }
  return false;
}
