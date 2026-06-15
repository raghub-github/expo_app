/** Customer rating / review for an order (merchant_store_ratings). */

export type OrderCustomerFeedback = {
  storeRating: number | null;
  foodRating: number | null;
  deliveryRating: number | null;
  packagingRating: number | null;
  storeReviewText: string | null;
  /** Stored in merchant_store_ratings.review_title (legacy) or rider_review_text */
  riderReviewText: string | null;
  storeReviewTags: string[];
  riderReviewTags: string[];
  ratedAtIso: string | null;
  customerName: string | null;
};

export function hasMerchantFeedback(
  fb: OrderCustomerFeedback | null | undefined
): boolean {
  if (!fb) return false;
  return fb.storeRating != null && fb.storeRating >= 1;
}

export function hasRiderFeedback(
  fb: OrderCustomerFeedback | null | undefined
): boolean {
  if (!fb) return false;
  return fb.deliveryRating != null && fb.deliveryRating >= 1;
}

export function formatTipInr(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return `₹${amount.toFixed(2)}`;
}
