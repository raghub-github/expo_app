import type { RiderOrderSummary } from "@/src/services/api/riderApi";

/** Merge pending + live pool by order id. Live pool hydrates over pending.
 * Force / high-priority offers stay at the front so the modal surfaces them first.
 */
export function mergeIncomingOfferLists(
  available: RiderOrderSummary[],
  pending: RiderOrderSummary[]
): RiderOrderSummary[] {
  const map = new Map<string, RiderOrderSummary>();
  for (const o of pending) {
    if (o?.id) map.set(o.id, o);
  }
  for (const o of available) {
    if (o?.id) map.set(o.id, o);
  }
  return [...map.values()].sort((a, b) => {
    const pri = Number(b.higherDispatchPriority === true) - Number(a.higherDispatchPriority === true);
    if (pri !== 0) return pri;
    const tip = (Number(b.customerTipAmount) || 0) - (Number(a.customerTipAmount) || 0);
    if (tip !== 0) return tip;
    return 0;
  });
}

export function detectNewOfferIds(prevIds: ReadonlySet<string>, nextIds: string[]): string[] {
  const out: string[] = [];
  for (const id of nextIds) {
    if (!id || prevIds.has(id)) continue;
    out.push(id);
  }
  return out;
}

export function offerMatchesId(order: RiderOrderSummary, orderId: string): boolean {
  const id = orderId.trim();
  if (!id) return false;
  return order.id === id || String(order.formattedOrderId ?? "").trim() === id;
}

export function dropOfferFromLists(
  list: RiderOrderSummary[] | undefined,
  orderId: string
): RiderOrderSummary[] | undefined {
  if (!list) return list;
  const next = list.filter((o) => !offerMatchesId(o, orderId));
  return next.length === list.length ? list : next;
}
