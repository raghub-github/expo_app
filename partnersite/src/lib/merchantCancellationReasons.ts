/** Merchant reject / cancel reasons (exact strings stored in orders_food.rejected_reason). */
export const MERCHANT_CANCELLATION_REASONS = [
  'Items out of stock',
  'Not operational today',
  'Nearing closing time',
  'Nearing opening time',
  'Kitchen is full',
] as const;

export type MerchantCancellationReason = (typeof MERCHANT_CANCELLATION_REASONS)[number];

export function isMerchantCancellationReason(value: string): value is MerchantCancellationReason {
  return (MERCHANT_CANCELLATION_REASONS as readonly string[]).includes(value);
}

export const REASON_ITEMS_OUT_OF_STOCK = 'Items out of stock' as const;
export const REASON_NOT_OPERATIONAL_TODAY = 'Not operational today' as const;

export function isItemsOutOfStockReason(reason: string): boolean {
  return reason === REASON_ITEMS_OUT_OF_STOCK;
}

export function isNotOperationalTodayReason(reason: string): boolean {
  return reason === REASON_NOT_OPERATIONAL_TODAY;
}

export function rejectReasonNeedsFollowUp(reason: string): boolean {
  return isItemsOutOfStockReason(reason) || isNotOperationalTodayReason(reason);
}
