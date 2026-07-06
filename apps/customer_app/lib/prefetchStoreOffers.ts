import type { QueryClient } from "@tanstack/react-query";
import {
  offersService,
  type StoreOffersResponse,
} from "@/services/offers.service";
import { useLocationStore } from "@/store/locationStore";

export const STORE_OFFERS_STALE_MS = 3 * 60 * 1000;

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

export function getSyncStoreOffers(
  queryClient: QueryClient,
  merchantId: string,
  geo?: StoreOffersGeo
): StoreOffersResponse | undefined {
  if (!merchantId) return undefined;
  return queryClient.getQueryData<StoreOffersResponse>(
    buildStoreOffersQueryKey(merchantId, geo)
  );
}

export function filterVisibleStoreOffers(
  data: StoreOffersResponse | undefined | null
): Array<StoreOffersResponse["merchant_offers"][number] | StoreOffersResponse["platform_offers"][number]> {
  if (!data) return [];
  const live = [...(data.merchant_offers ?? []), ...(data.platform_offers ?? [])];
  return live.filter((o) => {
    const blob = `${o.label ?? ""} ${o.sub_label ?? ""}`.toLowerCase();
    return !/\bfree\s*delivery\b/.test(blob) && !/\bfree\s*del\b/.test(blob);
  });
}

export function offerTextsFromStoreOffers(
  data: StoreOffersResponse | undefined | null,
  fallbackOfferText?: string | null
): string[] {
  const fromApi = filterVisibleStoreOffers(data)
    .map((o) => {
      const label = (o.label ?? "").trim();
      const sub = (o.sub_label ?? "").trim();
      if (!label) return null;
      return sub ? `${label} · ${sub}` : label;
    })
    .filter((x): x is string => !!x);
  if (fromApi.length > 0) return fromApi;
  const fallback = fallbackOfferText?.trim();
  return fallback ? [fallback] : [];
}

/** Warm store offer strip before merchant inner page paints. */
export async function prefetchStoreOffers(
  queryClient: QueryClient,
  merchantId: string,
  geo?: StoreOffersGeo
): Promise<void> {
  if (!merchantId) return;
  const queryKey = buildStoreOffersQueryKey(merchantId, geo);
  const state = queryClient.getQueryState({ queryKey });
  if (
    state?.dataUpdatedAt != null &&
    Date.now() - state.dataUpdatedAt < STORE_OFFERS_STALE_MS
  ) {
    return;
  }

  await queryClient.prefetchQuery({
    queryKey,
    queryFn: () =>
      offersService.getStoreOffers({
        storeId: merchantId,
        pincode: geo?.pincode?.trim() || undefined,
        state: geo?.state?.trim() || undefined,
        city: geo?.city?.trim() || undefined,
        lat: geo?.lat ?? undefined,
        lng: geo?.lng ?? undefined,
        serviceType: "FOOD",
      }),
    staleTime: STORE_OFFERS_STALE_MS,
    retry: 1,
  });
}

export function prefetchStoreOffersFromLocationStore(
  queryClient: QueryClient,
  merchantId: string
): void {
  const { address, coords } = useLocationStore.getState();
  void prefetchStoreOffers(queryClient, merchantId, {
    pincode: address?.pincode,
    state: address?.state,
    city: address?.city,
    lat: coords?.latitude,
    lng: coords?.longitude,
  });
}
