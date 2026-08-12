import { useSyncExternalStore } from "react";
import {
  isRiderTrackingOrderVisible,
  subscribeRiderTrackingVisibility,
} from "@/lib/riderTrackingVisibility";

/** True when this order's tracking session may run (visible row or always-on detail screen). */
export function useRiderTrackingOrderVisible(
  ordersFoodId: number | null,
  alwaysVisible = false
): boolean {
  return useSyncExternalStore(
    subscribeRiderTrackingVisibility,
    () => alwaysVisible || isRiderTrackingOrderVisible(ordersFoodId),
    () => alwaysVisible || isRiderTrackingOrderVisible(ordersFoodId)
  );
}
