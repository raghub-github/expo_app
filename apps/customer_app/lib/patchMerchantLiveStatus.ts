import type { QueryClient } from "@tanstack/react-query";
import type { MerchantDetail } from "@/services/merchant.service";
import type { LiveStatus } from "@/store/storeStatusStore";
import {
  MERCHANT_DETAIL_QUERY_KEY,
  readSyncMerchantMenu,
  updateCachedMerchantMenu,
} from "@/lib/merchantMenuCache";

export type StoreLiveStatusSnapshot = {
  liveStatus: LiveStatus;
  nextOpenAt?: string | null;
  nextCloseAt?: string | null;
  rushActive?: boolean;
  rushEndsAt?: string | null;
  rushRemainingMinutes?: number | null;
};

function patchDetail(
  detail: MerchantDetail | undefined,
  snapshot: StoreLiveStatusSnapshot
): MerchantDetail | undefined {
  if (!detail) return detail;
  return {
    ...detail,
    liveStatus: snapshot.liveStatus,
    isOpen: snapshot.liveStatus === "OPEN",
    nextOpenAt: snapshot.nextOpenAt ?? detail.nextOpenAt ?? null,
    nextCloseAt: snapshot.nextCloseAt ?? detail.nextCloseAt ?? null,
    rushActive: snapshot.rushActive ?? detail.rushActive ?? false,
    rushEndsAt: snapshot.rushEndsAt ?? detail.rushEndsAt ?? null,
    rushRemainingMinutes:
      snapshot.rushRemainingMinutes ?? detail.rushRemainingMinutes ?? null,
  };
}

/** Keep React Query + persisted menu cache aligned with GET /live-status. */
export function patchMerchantDetailLiveStatus(
  queryClient: QueryClient,
  merchantId: string,
  snapshot: StoreLiveStatusSnapshot
): void {
  const queryKey = MERCHANT_DETAIL_QUERY_KEY(merchantId);
  const current = queryClient.getQueryData<MerchantDetail>(queryKey);
  const next = patchDetail(current, snapshot);
  if (next) queryClient.setQueryData(queryKey, next);

  const cached = readSyncMerchantMenu(merchantId);
  if (cached?.menu?.length) {
    const patched = patchDetail(cached, snapshot);
    if (patched) void updateCachedMerchantMenu(merchantId, patched);
  }
}
