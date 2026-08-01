/**
 * Query-key primitives for store offers.
 *
 * Kept dependency-free so both `prefetchStoreOffers` and `storeOffersCache` can
 * import it without forming a require cycle.
 */

export const STORE_OFFERS_STALE_MS = 60_000;

export type StoreOffersGeo = {
  pincode?: string | null;
  state?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function buildStoreOffersQueryKey(
  merchantId: string,
  geo?: StoreOffersGeo
): readonly [
  "store-offers",
  string,
  string | undefined,
  string | undefined,
  number | undefined,
  number | undefined,
] {
  return [
    "store-offers",
    merchantId,
    geo?.pincode?.trim() || undefined,
    geo?.state?.trim() || undefined,
    geo?.lat ?? undefined,
    geo?.lng ?? undefined,
  ] as const;
}
