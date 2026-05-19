/** Merchant reject / cancel reasons (stored in orders_food.rejected_reason). */
export const MERCHANT_CANCELLATION_REASONS = [
  "Items out of stock",
  "Not operational today",
  "Nearing closing time",
  "Nearing opening time",
  "Kitchen is full",
] as const;

export type MerchantCancellationReason = (typeof MERCHANT_CANCELLATION_REASONS)[number];
