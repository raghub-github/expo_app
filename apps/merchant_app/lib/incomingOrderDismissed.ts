/**
 * Shared dismiss/resolved set for merchant incoming orders.
 * Accept / reject / X poison reopen + Expo Go local re-chime while board lags.
 */
const dismissedCoreIdsMem = new Set<number>();
const resolvedFoodIdsMem = new Set<string>();

export function isIncomingOrderDismissed(orderCoreId: number): boolean {
  const id = Number(orderCoreId);
  return Number.isFinite(id) && dismissedCoreIdsMem.has(id);
}

export function isIncomingOrderResolved(
  orderCoreId?: number | null,
  foodId?: string | number | null
): boolean {
  if (orderCoreId != null && isIncomingOrderDismissed(orderCoreId)) return true;
  const food = String(foodId ?? "").trim();
  return food.length > 0 && !food.startsWith("core-") && resolvedFoodIdsMem.has(food);
}

export function markIncomingOrderDismissedLocal(orderCoreId: number): void {
  const id = Number(orderCoreId);
  if (!Number.isFinite(id) || id <= 0) return;
  dismissedCoreIdsMem.add(id);
}

/** Leave CREATED (accept/reject) — never revive the New-tab sheet from a stale GET/push. */
export function markIncomingOrderResolved(args: {
  orderCoreId?: number | null;
  foodId?: string | number | null;
}): void {
  if (args.orderCoreId != null) markIncomingOrderDismissedLocal(args.orderCoreId);
  const food = String(args.foodId ?? "").trim();
  if (food && !food.startsWith("core-")) resolvedFoodIdsMem.add(food);
}

export function hydrateIncomingOrderDismissedLocal(ids: Iterable<number>): void {
  for (const raw of ids) {
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0) dismissedCoreIdsMem.add(id);
  }
}
