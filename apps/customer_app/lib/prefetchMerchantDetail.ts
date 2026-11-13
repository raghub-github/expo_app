import type { QueryClient } from "@tanstack/react-query";
import {
  type MerchantDetail,
  type MerchantSummary,
} from "@/services/merchant.service";
import {
  fetchMerchantByIdWithCache,
  hydrateMerchantMenuQuery,
  MERCHANT_DETAIL_GC_MS,
  MERCHANT_DETAIL_QUERY_KEY,
  MERCHANT_DETAIL_STALE_MS,
  readSyncMerchantMenu,
  seedMerchantMenuQueryIfCached,
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

  const listQueries = queryClient.getQueriesData<unknown>({
    queryKey: ["merchants"],
  });
  for (const [, payload] of listQueries) {
    const list = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
        ? (payload as { items: MerchantSummary[] }).items
        : null;
    if (!list) continue;
    const hit = list.find((m) => m && typeof m === "object" && (m as MerchantSummary).id === merchantId);
    if (hit) return hit as MerchantSummary;
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
 * Full menu download starts immediately on cold miss (pressIn / navigate) so the
 * inner page does not sit on menu_loading skeletons after hero already painted.
 */
export function prefetchMerchantDetail(
  queryClient: QueryClient,
  merchantId: string
): void {
  if (!merchantId) return;

  // Seed sync/disk cache into React Query first.
  seedMerchantMenuQueryIfCached(queryClient, merchantId);
  void hydrateMerchantMenuQuery(queryClient, merchantId);

  const cachedMenu = readSyncMerchantMenu(merchantId);
  const hasMenu = (cachedMenu?.menu?.length ?? 0) > 0
    || ((queryClient.getQueryData<MerchantDetail>(MERCHANT_DETAIL_QUERY_KEY(merchantId))?.menu?.length) ?? 0) > 0;

  if (hasMenu) {
    const detail =
      queryClient.getQueryData<MerchantDetail>(MERCHANT_DETAIL_QUERY_KEY(merchantId)) ??
      cachedMenu;
    if (detail?.menu?.length) {
      void prefetchMenuItemImagesForMenu(detail.menu);
      prefetchMerchantHeroImage(detail);
    }
    // Cheap version check — does not block first paint.
    void syncMerchantMenuInBackground(queryClient, merchantId);
  } else {
    // Cold open: start the same query the store page uses — ASAP, before route mount.
    void queryClient.prefetchQuery({
      queryKey: MERCHANT_DETAIL_QUERY_KEY(merchantId),
      queryFn: () => fetchMerchantByIdWithCache(merchantId),
      staleTime: MERCHANT_DETAIL_STALE_MS,
      gcTime: MERCHANT_DETAIL_GC_MS,
    });
  }

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

  const summary = findMerchantSummaryInCache(queryClient, merchantId);
  if (summary) {
    warmMerchantHeroImage(merchantId, resolveMerchantCarouselBannerUri(summary));
    prefetchMerchantHeroImage(summary);
  }
}
