import type { QueryClient } from "@tanstack/react-query";
import {
  merchantService,
  type MerchantDetail,
} from "@/services/merchant.service";
import { mergeMenuDelta, menuVersionsMatch } from "@/lib/merchantMenuDelta";
import {
  MERCHANT_DETAIL_QUERY_KEY,
  readSyncMerchantMenu,
  updateCachedMerchantMenu,
  writeCachedMerchantMenu,
} from "@/lib/merchantMenuCache";
import { prefetchMenuItemImagesForMenu } from "@/lib/prefetchMenuItemImages";

const syncInFlight = new Set<string>();

/** Non-blocking version check + delta merge. Never blocks UI. */
export async function syncMerchantMenuInBackground(
  queryClient: QueryClient,
  merchantId: string
): Promise<void> {
  if (!merchantId || syncInFlight.has(merchantId)) return;
  syncInFlight.add(merchantId);

  try {
    const queryKey = MERCHANT_DETAIL_QUERY_KEY(merchantId);
    const cached =
      queryClient.getQueryData<MerchantDetail>(queryKey) ?? readSyncMerchantMenu(merchantId);

    if (!cached?.menu?.length) {
      const detail = await merchantService.getMerchantById(merchantId);
      if (!detail) return;
      queryClient.setQueryData(queryKey, detail);
      await writeCachedMerchantMenu(merchantId, detail);
      void prefetchMenuItemImagesForMenu(detail.menu ?? []);
      return;
    }

    const version = await merchantService.getMenuVersion(merchantId);
    if (!version) return;

    if (menuVersionsMatch(cached.menuVersion, version.menuVersion)) {
      return;
    }

    const sinceVersion = cached.menuVersion ?? 0;
    const delta = await merchantService.getMenuDelta(merchantId, sinceVersion);

    if (!delta || delta.unchanged) return;

    if (delta.requiresFullSync) {
      const detail = await merchantService.getMerchantById(merchantId, undefined, {
        ifNoneMatch: version.etag,
      });
      if (!detail) return;
      queryClient.setQueryData(queryKey, detail);
      await writeCachedMerchantMenu(merchantId, detail);
      void prefetchMenuItemImagesForMenu(detail.menu ?? []);
      return;
    }

    const mergedMenu = mergeMenuDelta(cached.menu ?? [], delta);
    const nextDetail: MerchantDetail = {
      ...cached,
      menu: mergedMenu,
      menuVersion: delta.menuVersion,
      etag: version.etag,
    };

    queryClient.setQueryData(queryKey, nextDetail);
    await updateCachedMerchantMenu(merchantId, nextDetail);

    if (delta.changedItems?.length) {
      void prefetchMenuItemImagesForMenu(delta.changedItems);
    }
  } catch {
    // Silent — cached UI remains.
  } finally {
    syncInFlight.delete(merchantId);
  }
}
