import type { StoreFoodItemsUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import type { MerchantSummary } from "@/services/merchant.service";

export const CLASSIC_POPULAR_MIN_RATING = 3.8;

export function resolveClassicStoreRating(
  store: StoreFoodItemsUnderPrice,
  merchant?: MerchantSummary | null
): number | null {
  const fromStore = store.avgRating;
  if (fromStore != null && Number.isFinite(fromStore) && fromStore > 0) {
    return Number(fromStore);
  }
  const fromMerchant = merchant?.avgRating;
  if (fromMerchant != null && Number.isFinite(Number(fromMerchant)) && Number(fromMerchant) > 0) {
    return Number(fromMerchant);
  }
  return null;
}

export function isClassicPopularRatedStore(
  store: StoreFoodItemsUnderPrice,
  merchant?: MerchantSummary | null,
  minRating = CLASSIC_POPULAR_MIN_RATING
): boolean {
  const rating = resolveClassicStoreRating(store, merchant);
  return rating != null && rating > minRating;
}
