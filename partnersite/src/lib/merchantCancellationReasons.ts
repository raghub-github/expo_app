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
