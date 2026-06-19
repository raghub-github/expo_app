import type { MerchantSummary } from "@/services/merchant.service";

const LOVED_RATING_MIN = 4;
export const LOVED_GRID_MAX = 6;

function hasEstablishedCustomerRating(merchant: MerchantSummary): boolean {
  const ratingRaw = merchant.avgRating;
  if (ratingRaw == null || !Number.isFinite(Number(ratingRaw))) return false;
  const rating = Number(ratingRaw);
  const reviewsRaw = merchant.totalReviews;
  const reviews =
    reviewsRaw != null && Number.isFinite(Number(reviewsRaw)) ? Number(reviewsRaw) : 0;
  return rating >= LOVED_RATING_MIN && reviews > 0;
}

/** Stores with 4+ rating and at least one review — excludes new / unrated stores. */
export function pickLovedByCustomersMerchants(merchants: MerchantSummary[]): MerchantSummary[] {
  if (merchants.length === 0) {
    return [];
  }

  return merchants
    .filter(hasEstablishedCustomerRating)
    .sort((a, b) => {
      const ordersA = Math.max(0, Number(a.completedOrderCount ?? 0));
      const ordersB = Math.max(0, Number(b.completedOrderCount ?? 0));
      if (ordersB !== ordersA) return ordersB - ordersA;
      const ratingA = Number(a.avgRating ?? 0);
      const ratingB = Number(b.avgRating ?? 0);
      if (ratingB !== ratingA) return ratingB - ratingA;
      return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    })
    .slice(0, LOVED_GRID_MAX);
}

/** @deprecated Use pickLovedByCustomersMerchants — near-you list is the full filtered list. */
export function splitLovedAndNearYouMerchants(merchants: MerchantSummary[]): {
  loved: MerchantSummary[];
  nearYou: MerchantSummary[];
} {
  const loved = pickLovedByCustomersMerchants(merchants);
  return { loved, nearYou: merchants };
}
