import type { QueryClient } from "@tanstack/react-query";
import {
  type MerchantDetail,
  type MerchantSummary,
} from "@/services/merchant.service";
import {
  hydrateMerchantMenuQuery,
  hasMemoryMerchantMenu,
  MERCHANT_DETAIL_GC_MS,
  MERCHANT_DETAIL_QUERY_KEY,
  MERCHANT_DETAIL_STALE_MS,
  readSyncMerchantMenu,
} from "@/lib/merchantMenuCache";
import { syncMerchantMenuInBackground } from "@/lib/merchantMenuSync";

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

  const placeholder = getMerchantDetailPlaceholder(queryClient, merchantId);
  if (placeholder && !queryClient.getQueryData(MERCHANT_DETAIL_QUERY_KEY(merchantId))) {
    queryClient.setQueryData(MERCHANT_DETAIL_QUERY_KEY(merchantId), placeholder);
  }

  if (hasMemoryMerchantMenu(merchantId)) {
    void syncMerchantMenuInBackground(queryClient, merchantId);
    return;
  }

  void syncMerchantMenuInBackground(queryClient, merchantId);
}
