import type { QueryClient } from "@tanstack/react-query";
import {
  type MerchantDetail,
  type MerchantSummary,
} from "@/services/merchant.service";
import {
  hydrateMerchantMenuQuery,
  MERCHANT_DETAIL_GC_MS,
  MERCHANT_DETAIL_QUERY_KEY,
  MERCHANT_DETAIL_STALE_MS,
  readSyncMerchantMenu,
} from "@/lib/merchantMenuCache";
import { syncMerchantMenuInBackground } from "@/lib/merchantMenuSync";
import { STORE_LIVE_STATUS_QUERY_KEY } from "@/hooks/useStoreDetailLiveStatus";
import { merchantService } from "@/services/merchant.service";
import {
  prefetchMerchantHeroImageUri,
  warmMerchantHeroImage,
} from "@/lib/merchantHeroWarmCache";
import { resolveMerchantCarouselBannerUri } from "@/lib/merchantBanner";
import { prefetchStoreOffersFromLocationStore } from "@/lib/prefetchStoreOffers";
import { prefetchMenuItemImagesForMenu } from "@/lib/prefetchMenuItemImages";
import { seedStoreOffersQueryIfCached } from "@/lib/storeOffersCache";
import { useLocationStore } from "@/store/locationStore";

export {
  MERCHANT_DETAIL_QUERY_KEY,
  MERCHANT_DETAIL_STALE_MS,
  MERCHANT_DETAIL_GC_MS,
} from "@/lib/merchantMenuCache";

/** Find a list-card summary already loaded on home / category / search. */
export function findMerchantSummaryInCache(
  queryClient: QueryClient,
  merchantId: string
): MerchantSummary | null {
  if (!merchantId) return null;

  const listQueries = queryClient.getQueriesData<MerchantSummary[]>({
    queryKey: ["merchants"],
  });
  for (const [, list] of listQueries) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((m) => m.id === merchantId);
    if (hit) return hit;
  }

  const searchQueries = queryClient.getQueriesData<{ stores?: MerchantSummary[] }>({
    queryKey: ["search"],
  });
  for (const [, payload] of searchQueries) {
    const stores = payload?.stores;
    if (!Array.isArray(stores)) continue;
    const hit = stores.find((m) => m.id === merchantId);
    if (hit) return hit;
  }

  return null;
}

export function merchantSummaryToDetailPlaceholder(
  summary: MerchantSummary
): MerchantDetail {
  return {
    ...summary,
    menu: [],
    imageUrl: summary.displayImage ?? summary.banner_url ?? null,
    bannerImages: summary.galleryImages ?? [],
  };
}

export function getMerchantDetailPlaceholder(
  queryClient: QueryClient,
  merchantId: string
): MerchantDetail | undefined {
  if (!merchantId) return undefined;

  const cached = queryClient.getQueryData<MerchantDetail>(
    MERCHANT_DETAIL_QUERY_KEY(merchantId)
  );
  if (cached?.menu?.length) return cached;

  const persisted = readSyncMerchantMenu(merchantId);
  if (persisted?.menu?.length) return persisted;

  const summary = findMerchantSummaryInCache(queryClient, merchantId);
  return summary ? merchantSummaryToDetailPlaceholder(summary) : undefined;
}

function prefetchMerchantHeroImage(merchant: MerchantDetail | MerchantSummary | undefined): void {
  if (!merchant) return;
  const fromCarousel = resolveMerchantCarouselBannerUri(merchant);
  const raw =
    fromCarousel ??
    (merchant as MerchantDetail).imageUrl ??
    merchant.displayImage ??
    merchant.banner_url ??
    null;
  prefetchMerchantHeroImageUri(raw);
  if ("id" in merchant && merchant.id) {
    warmMerchantHeroImage(merchant.id, raw);
  }
}

/**
 * Warm store page: memory-first instant render.
 * Full menu download only on first visit; revisits use version check + delta.
 */
export function prefetchMerchantDetail(
  queryClient: QueryClient,
  merchantId: string
): void {
  if (!merchantId) return;

  void hydrateMerchantMenuQuery(queryClient, merchantId);

  const { address, coords } = useLocationStore.getState();
  seedStoreOffersQueryIfCached(queryClient, merchantId, {
    pincode: address?.pincode,
    state: address?.state,
    city: address?.city,
    lat: coords?.latitude,
    lng: coords?.longitude,
  });

  void queryClient.prefetchQuery({
    queryKey: STORE_LIVE_STATUS_QUERY_KEY(merchantId),
    queryFn: () => merchantService.getStoreLiveStatusSnapshot(merchantId),
    staleTime: 30_000,
  });

  prefetchStoreOffersFromLocationStore(queryClient, merchantId, { force: true });

  const placeholder = getMerchantDetailPlaceholder(queryClient, merchantId);
  if (placeholder && !queryClient.getQueryData(MERCHANT_DETAIL_QUERY_KEY(merchantId))) {
    queryClient.setQueryData(MERCHANT_DETAIL_QUERY_KEY(merchantId), placeholder);
  }

  prefetchMerchantHeroImage(
    placeholder ?? queryClient.getQueryData<MerchantDetail>(MERCHANT_DETAIL_QUERY_KEY(merchantId))
  );

  const summary = findMerchantSummaryInCache(queryClient, merchantId);
  if (summary) {
    warmMerchantHeroImage(merchantId, resolveMerchantCarouselBannerUri(summary));
  }

  const cachedMenu = readSyncMerchantMenu(merchantId);
  if (cachedMenu?.menu?.length) {
    void prefetchMenuItemImagesForMenu(cachedMenu.menu);
  }

  void syncMerchantMenuInBackground(queryClient, merchantId);
}
