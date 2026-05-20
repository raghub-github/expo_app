import type { MerchantSummary } from "@/services/merchant.service";

const LOVED_RATING_MIN = 4;
export const LOVED_GRID_MAX = 6;
const TOP_BY_ORDERS_SLOTS = 6;

/** Stores with 4+ rating and/or among top order volume nearby — for Loved by Customers. */
export function pickLovedByCustomersMerchants(merchants: MerchantSummary[]): MerchantSummary[] {
  if (merchants.length === 0) {
    return [];
  }

  const enriched = merchants.map((m) => ({
    m,
    orders: Math.max(0, Number(m.completedOrderCount ?? 0)),
    rating: m.avgRating != null && Number.isFinite(Number(m.avgRating)) ? Number(m.avgRating) : 0,
  }));

  const topOrderIds = new Set(
    [...enriched]
      .filter((x) => x.orders > 0)
      .sort((a, b) => b.orders - a.orders)
      .slice(0, TOP_BY_ORDERS_SLOTS)
      .map((x) => x.m.id)
  );

  const lovedPool = enriched.filter(
    (x) => x.rating >= LOVED_RATING_MIN || topOrderIds.has(x.m.id)
  );

  const loved = [...lovedPool]
    .sort((a, b) => {
      if (b.orders !== a.orders) return b.orders - a.orders;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return (a.m.distanceKm ?? 999) - (b.m.distanceKm ?? 999);
    })
    .slice(0, LOVED_GRID_MAX)
    .map((x) => x.m);

  return loved;
}

/** @deprecated Use pickLovedByCustomersMerchants — near-you list is the full filtered list. */
export function splitLovedAndNearYouMerchants(merchants: MerchantSummary[]): {
  loved: MerchantSummary[];
  nearYou: MerchantSummary[];
} {
  const loved = pickLovedByCustomersMerchants(merchants);
  return { loved, nearYou: merchants };
}
