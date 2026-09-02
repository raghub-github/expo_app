import type { MerchantSummary } from "@/services/merchant.service";

/**
 * Discovery rank — orders + rating quality + review volume.
 * Avoids "first registered store always on top" when default sort is used.
 */
export function merchantDiscoveryScore(merchant: MerchantSummary): number {
  const orders = Math.max(0, Number(merchant.completedOrderCount ?? 0));
  const rating = Number(merchant.avgRating ?? 0);
  const reviews = Math.max(0, Number(merchant.totalReviews ?? 0));
  const reviewSignal = Math.log10(reviews + 1);
  const ratingQuality =
    rating >= 4.5 ? rating * reviewSignal * 120 : rating >= 4 ? rating * reviewSignal * 80 : rating * 20;
  const establishedBonus = rating >= 4 && reviews >= 5 ? 150 : 0;
  return orders * 1000 + ratingQuality + establishedBonus;
}

export function compareMerchantsByDiscoveryRank(
  a: MerchantSummary,
  b: MerchantSummary
): number {
  const scoreDelta = merchantDiscoveryScore(b) - merchantDiscoveryScore(a);
  if (scoreDelta !== 0) return scoreDelta;
  const ratingDelta = (b.avgRating ?? 0) - (a.avgRating ?? 0);
  if (ratingDelta !== 0) return ratingDelta;
  return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
}
