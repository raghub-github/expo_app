/** Statuses where merchant must keep processing until done (even if store is closed for new orders). */
export const ACTIVE_MERCHANT_ORDER_STATUSES = new Set([
  'CREATED',
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'RTO',
]);

export function normalizeFoodOrderStatusKey(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function isActiveMerchantFoodOrderStatus(status: string | null | undefined): boolean {
  return ACTIVE_MERCHANT_ORDER_STATUSES.has(normalizeFoodOrderStatusKey(status));
}
