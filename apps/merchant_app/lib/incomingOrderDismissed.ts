/**
 * Shared dismiss/resolved set for merchant incoming orders.
 * Accept / reject / X poison reopen + Expo Go local re-chime while board lags.
 */
const dismissedCoreIdsMem = new Set<number>();

export function isIncomingOrderDismissed(orderCoreId: number): boolean {
  const id = Number(orderCoreId);
  return Number.isFinite(id) && dismissedCoreIdsMem.has(id);
}

export function markIncomingOrderDismissedLocal(orderCoreId: number): void {
  const id = Number(orderCoreId);
  if (!Number.isFinite(id)) return;
  dismissedCoreIdsMem.add(id);
}

export function hydrateIncomingOrderDismissedLocal(ids: Iterable<number>): void {
  for (const raw of ids) {
    const id = Number(raw);
    if (Number.isFinite(id)) dismissedCoreIdsMem.add(id);
  }
}
