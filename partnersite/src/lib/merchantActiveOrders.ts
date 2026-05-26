/** Food order statuses still in the merchant live pipeline (any date). */
export const ACTIVE_MERCHANT_FOOD_ORDER_STATUSES = [
  'CREATED',
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'RTO',
] as const;

export function normalizeFoodOrderStatusKey(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function isActiveMerchantFoodOrderStatus(status: string | null | undefined): boolean {
  return (ACTIVE_MERCHANT_FOOD_ORDER_STATUSES as readonly string[]).includes(
    normalizeFoodOrderStatusKey(status)
  );
}

/** Merchant app parity: platform riders complete delivery; merchant only for self-delivery. */
export function canMerchantMarkDelivered(order: {
  delivery_type?: string | null;
}): boolean {
  const t = String(order.delivery_type ?? 'GATIMITRA_RIDER').toUpperCase();
  if (t === 'GATIMITRA_RIDER' || t === 'GATIMITRA') return false;
  return t === 'SELF_DELIVERY' || t === 'SELF_PICKUP' || t === 'MX_SELF';
}
