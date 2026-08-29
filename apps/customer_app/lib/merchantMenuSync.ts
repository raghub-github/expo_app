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
import { patchMerchantDetailLiveStatus } from "@/lib/patchMerchantLiveStatus";
import { prefetchMenuItemImagesForMenu } from "@/lib/prefetchMenuItemImages";
import { useStoreStatusStore } from "@/store/storeStatusStore";

const syncInFlight = new Set<string>();
const lastSyncAtByMerchant = new Map<string, number>();

async function refreshLiveStatusInCache(
  queryClient: QueryClient,
  merchantId: string
): Promise<void> {
  const snapshot = await merchantService.getStoreLiveStatusSnapshot(merchantId);
  if (!snapshot) return;
  useStoreStatusStore
    .getState()
    .setStatusFromApi(merchantId, snapshot.liveStatus === "OPEN", snapshot.liveStatus);
  patchMerchantDetailLiveStatus(queryClient, merchantId, snapshot);
}

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

    // Always version-check (cheap). Admin banner / hero-video uploads bump
    // merchant_stores.updated_at and must not be skipped by a sync gap.
    const version = await merchantService.getMenuVersion(merchantId);
    if (!version) return;

    if (menuVersionsMatch(cached.menuVersion, version.menuVersion)) {
      return;
    }

    const sinceVersion = cached.menuVersion ?? 0;
    const delta = await merchantService.getMenuDelta(merchantId, sinceVersion);

    if (!delta || delta.unchanged) return;

    const hasMenuItemDelta =
      (delta.changedItems?.length ?? 0) > 0 || (delta.deletedItemIds?.length ?? 0) > 0;

    // Store shell-only changes (banner video / banner image / gallery) bump
    // menuVersion via merchant_stores.updated_at but produce an empty menu delta.
    // Full fetch so Classic / Grid First inner pages pick up hero video.
    if (delta.requiresFullSync || !hasMenuItemDelta) {
      let detail = await merchantService.getMerchantById(merchantId, undefined, {
        ifNoneMatch: cached.etag,
      });
      if (!detail) {
        detail = await merchantService.getMerchantById(merchantId);
      }
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

    // Invalidate cart lines that disappeared from the customer-visible menu
    // (plan-locked, deleted, OOS, rejected). Checkout already rejects these;
    // this keeps the in-app cart honest in realtime.
    try {
      const { useCartStore } = await import("@/store/cartStore");
      // Menu rows expose BOTH `id` (business item_id) and `menuItemId` (numeric PK).
      // Cart lines usually store the PK — matching only `id` falsely wiped carts after
      // force-close / delta sync when re-entering via floating cart.
      const available = new Set<string>();
      for (const m of mergedMenu ?? []) {
        const bizId = String(m.id ?? "").trim();
        if (bizId) available.add(bizId);
        if (m.menuItemId != null && Number.isFinite(Number(m.menuItemId))) {
          available.add(String(m.menuItemId));
        }
      }
      // Never wipe the cart against an empty/broken menu snapshot.
      if (available.size > 0) {
        const removed = useCartStore
          .getState()
          .removeUnavailableMenuItems(merchantId, available);
        if (removed > 0) {
          const { useCartNoticeStore } = await import("@/store/cartNoticeStore");
          useCartNoticeStore.getState().showRemovedItems(removed);
        }
      }
    } catch {
      /* cart prune is best-effort */
    }

    if (delta.changedItems?.length) {
      void prefetchMenuItemImagesForMenu(delta.changedItems);
    }
  } catch {
    // Silent — cached UI remains.
  } finally {
    lastSyncAtByMerchant.set(merchantId, Date.now());
    syncInFlight.delete(merchantId);
  }
}
