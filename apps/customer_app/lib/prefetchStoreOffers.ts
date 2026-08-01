import type { QueryClient } from "@tanstack/react-query";
import {
  offersService,
  type StoreOffersResponse,
} from "@/services/offers.service";
import {
  formatCardOfferLine,
  formatListCardOfferFromMerchantOffer,
  formatListCardOfferFromPlatformOffer,
} from "@/lib/merchantOfferBadge";
import { useLocationStore } from "@/store/locationStore";
import {
  readSyncPersistedStoreOffers,
  writePersistedStoreOffers,
} from "@/lib/storeOffersCache";
import {
  buildStoreOffersQueryKey,
  STORE_OFFERS_STALE_MS,
  type StoreOffersGeo,
} from "@/lib/storeOffersQueryKey";

export {
  buildStoreOffersQueryKey,
  STORE_OFFERS_STALE_MS,
  type StoreOffersGeo,
};

/** Invalidate every geo-keyed store-offers query for one restaurant (offer-only). */
export function invalidateStoreOffersForMerchant(
  queryClient: QueryClient,
  merchantId: string
): Promise<void> {
  if (!merchantId) return Promise.resolve();
  return queryClient.invalidateQueries({
    queryKey: ["store-offers", merchantId],
    exact: false,
  });
}

/**
 * Patch Food Home merchants-list `offerText` so list cards match detail after an offers refresh.
 * Does not refetch the list — silent in-memory patch only.
 */
export function patchMerchantsListOfferText(
  queryClient: QueryClient,
  merchantId: string,
  offerTexts: string[]
): void {
  if (!merchantId) return;
  const joined = offerTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .join(" | ");
  queryClient.setQueriesData<Array<{ id?: string; offerText?: string | null }>>(
    { queryKey: ["merchants"] },
    (old) => {
      if (!Array.isArray(old)) return old;
      let changed = false;
      const next = old.map((m) => {
        if (String(m?.id ?? "") !== merchantId) return m;
        if ((m.offerText ?? "") === joined) return m;
        changed = true;
        return { ...m, offerText: joined || null };
      });
      return changed ? next : old;
    }
  );
}

export function getSyncStoreOffers(
  queryClient: QueryClient,
  merchantId: string,
  geo?: StoreOffersGeo
): StoreOffersResponse | undefined {
  if (!merchantId) return undefined;
  const fromRq = queryClient.getQueryData<StoreOffersResponse>(
    buildStoreOffersQueryKey(merchantId, geo)
  );
  if (fromRq) return fromRq;
  return readSyncPersistedStoreOffers(merchantId, geo);
}

function isFreeDeliveryBlob(label: string, subLabel: string): boolean {
  const blob = `${label} ${subLabel}`.toLowerCase();
  return /\bfree\s*delivery\b/.test(blob) || /\bfree\s*del\b/.test(blob);
}

function isItemOnlyMerchantOffer(
  o: StoreOffersResponse["merchant_offers"][number]
): boolean {
  if (o.display_surface === "item") return true;
  if (o.display_surface === "sheet" || o.display_surface === "both") return false;
  // Legacy responses without display_surface
  const type = String(o.offer_type ?? "").toUpperCase();
  if (type === "BOGO" || type === "BUY_X_GET_Y" || type === "BUY_N_GET_M") return true;
  const hasItems = Array.isArray(o.menu_item_ids) && o.menu_item_ids.length > 0;
  const sub = String(o.offer_sub_type ?? "").toUpperCase();
  return (
    (hasItems || sub === "SPECIFIC_ITEM") &&
    (type === "PERCENTAGE" || type === "FLAT")
  );
}

/** Strip ticker: Precision / cart / both — not item-only Boost/BOGO. */
export function filterVisibleStoreOffers(
  data: StoreOffersResponse | undefined | null
): Array<StoreOffersResponse["merchant_offers"][number] | StoreOffersResponse["platform_offers"][number]> {
  if (!data) return [];
  const merchant = (data.merchant_offers ?? []).filter((o) => {
    if (isItemOnlyMerchantOffer(o)) return false;
    return !isFreeDeliveryBlob(o.label ?? "", o.sub_label ?? "");
  });
  const platform = (data.platform_offers ?? []).filter((o) => {
    return !isFreeDeliveryBlob(o.label ?? "", o.sub_label ?? "");
  });
  return [...merchant, ...platform];
}

/** Item-scoped Boost/BOGO for sheet “On menu items” + offer count. */
export function filterItemSurfaceStoreOffers(
  data: StoreOffersResponse | undefined | null
): StoreOffersResponse["merchant_offers"] {
  if (!data) return [];
  return (data.merchant_offers ?? []).filter((o) => {
    if (!isItemOnlyMerchantOffer(o)) return false;
    return !isFreeDeliveryBlob(o.label ?? "", o.sub_label ?? "");
  });
}

/** Full list for StoreOffersSheet (sheet + item merchant + platform). */
export function filterOffersForStoreSheet(
  data: StoreOffersResponse | undefined | null
): Array<StoreOffersResponse["merchant_offers"][number] | StoreOffersResponse["platform_offers"][number]> {
  if (!data) return [];
  const merchant = (data.merchant_offers ?? []).filter(
    (o) => !isFreeDeliveryBlob(o.label ?? "", o.sub_label ?? "")
  );
  const platform = (data.platform_offers ?? []).filter(
    (o) => !isFreeDeliveryBlob(o.label ?? "", o.sub_label ?? "")
  );
  return [...merchant, ...platform];
}

export function countStoreOffersForBadge(
  data: StoreOffersResponse | undefined | null
): number {
  return filterOffersForStoreSheet(data).length;
}

export function offerTextsFromStoreOffers(
  data: StoreOffersResponse | undefined | null,
  fallbackOfferText?: string | null
): string[] {
  const lines: string[] = [];
  const pushUnique = (line: string | null | undefined) => {
    const t = line?.trim();
    if (!t || lines.includes(t)) return;
    lines.push(t);
  };

  // Prefer live store offers — same Boost / BOGO / Precision lines as list card.
  // Never use label · sub_label (that is sheet detail copy only).
  if (data) {
    for (const o of data.merchant_offers ?? []) {
      const blob = `${o.label ?? ""} ${o.sub_label ?? ""}`.toLowerCase();
      if (/\bfree\s*delivery\b/.test(blob) || /\bfree\s*del\b/.test(blob)) continue;
      pushUnique(formatListCardOfferFromMerchantOffer(o));
    }
    for (const o of data.platform_offers ?? []) {
      pushUnique(formatListCardOfferFromPlatformOffer(o));
    }
    if (lines.length > 0) return lines;
  }

  // Loading fallback: merchant list-card offerText (pipe-joined compact headlines).
  if (fallbackOfferText?.trim()) {
    for (const part of fallbackOfferText.split(/\s*\|\s*/)) {
      const compact = formatCardOfferLine(part);
      if (compact) pushUnique(compact);
    }
  }

  return lines;
}

/** Warm store offer strip before merchant inner page paints. */
export async function prefetchStoreOffers(
  queryClient: QueryClient,
  merchantId: string,
  geo?: StoreOffersGeo,
  opts?: { force?: boolean }
): Promise<void> {
  if (!merchantId) return;
  const queryKey = buildStoreOffersQueryKey(merchantId, geo);
  const state = queryClient.getQueryState(queryKey);
  if (
    !opts?.force &&
    state?.dataUpdatedAt != null &&
    Date.now() - state.dataUpdatedAt < STORE_OFFERS_STALE_MS
  ) {
    return;
  }

  await queryClient.prefetchQuery({
    queryKey,
    queryFn: async () => {
      const data = await offersService.getStoreOffers({
        storeId: merchantId,
        pincode: geo?.pincode?.trim() || undefined,
        state: geo?.state?.trim() || undefined,
        city: geo?.city?.trim() || undefined,
        lat: geo?.lat ?? undefined,
        lng: geo?.lng ?? undefined,
        serviceType: "FOOD",
      });
      void writePersistedStoreOffers(merchantId, data, geo);
      return data;
    },
    staleTime: STORE_OFFERS_STALE_MS,
    retry: 1,
  });
}

export function prefetchStoreOffersFromLocationStore(
  queryClient: QueryClient,
  merchantId: string,
  opts?: { force?: boolean }
): void {
  const { address, coords } = useLocationStore.getState();
  void prefetchStoreOffers(
    queryClient,
    merchantId,
    {
      pincode: address?.pincode,
      state: address?.state,
      city: address?.city,
      lat: coords?.latitude,
      lng: coords?.longitude,
    },
    opts
  );
}

/**
 * Silent background refresh of store offers for an open restaurant detail page.
 * Preserves menu / scroll — only refetches offer queries.
 */
const storeOffersSyncInFlight = new Set<string>();

export async function syncStoreOffersInBackground(
  queryClient: QueryClient,
  merchantId: string
): Promise<void> {
  if (!merchantId || storeOffersSyncInFlight.has(merchantId)) return;
  storeOffersSyncInFlight.add(merchantId);
  try {
    const { address, coords } = useLocationStore.getState();
    const geo: StoreOffersGeo = {
      pincode: address?.pincode,
      state: address?.state,
      city: address?.city,
      lat: coords?.latitude,
      lng: coords?.longitude,
    };
    const queryKey = buildStoreOffersQueryKey(merchantId, geo);
    const data = await queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const next = await offersService.getStoreOffers({
          storeId: merchantId,
          pincode: geo.pincode?.trim() || undefined,
          state: geo.state?.trim() || undefined,
          city: geo.city?.trim() || undefined,
          lat: geo.lat ?? undefined,
          lng: geo.lng ?? undefined,
          serviceType: "FOOD",
        });
        void writePersistedStoreOffers(merchantId, next, geo);
        return next;
      },
      staleTime: 0,
    });
    patchMerchantsListOfferText(
      queryClient,
      merchantId,
      offerTextsFromStoreOffers(data)
    );
  } catch {
    /* non-blocking */
  } finally {
    storeOffersSyncInFlight.delete(merchantId);
  }
}
