/**
 * Gates rider tracking sessions to visible FlatList rows (+ optional pin while sheet open).
 */
import { perfAuditMark } from "@/lib/perfAuditLog";

const visibleFoodIds = new Set<number>();
let pinnedFoodId: number | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

/** Replace the set of orders_food ids currently visible on the orders board. */
export function setVisibleRiderTrackingOrderIds(ids: Iterable<number>): void {
  visibleFoodIds.clear();
  for (const raw of ids) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) visibleFoodIds.add(Math.floor(n));
  }
  perfAuditMark("rider_tracking.visible_set_updated");
  notify();
}

/** Clear visibility when leaving the orders list (off-screen tabs / navigation). */
export function clearVisibleRiderTrackingOrderIds(): void {
  if (visibleFoodIds.size === 0) return;
  visibleFoodIds.clear();
  perfAuditMark("rider_tracking.visible_set_cleared");
  notify();
}

/** Keep tracking alive while the live tracking sheet is open (even if row scrolls away). */
export function pinRiderTrackingOrder(ordersFoodId: number): () => void {
  pinnedFoodId = ordersFoodId;
  perfAuditMark("rider_tracking.order_pinned");
  notify();
  return () => {
    if (pinnedFoodId === ordersFoodId) {
      pinnedFoodId = null;
      perfAuditMark("rider_tracking.order_unpinned");
      notify();
    }
  };
}

export function isRiderTrackingOrderVisible(ordersFoodId: number | null): boolean {
  if (ordersFoodId == null || !Number.isFinite(ordersFoodId) || ordersFoodId < 1) return false;
  return visibleFoodIds.has(ordersFoodId) || pinnedFoodId === ordersFoodId;
}

export function subscribeRiderTrackingVisibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVisibleRiderTrackingCountForAudit(): number {
  return visibleFoodIds.size + (pinnedFoodId != null ? 1 : 0);
}
