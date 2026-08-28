/**
 * Always refresh store OPEN/CLOSED on merchant detail — fast endpoint, independent of menu cache.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { merchantService } from "@/services/merchant.service";
import { patchMerchantDetailLiveStatus } from "@/lib/patchMerchantLiveStatus";
import { useStoreStatusStore } from "@/store/storeStatusStore";

export const STORE_LIVE_STATUS_QUERY_KEY = (storeId: string) =>
  ["merchant", storeId, "live-status"] as const;

export function useStoreDetailLiveStatus(storeId: string | null) {
  const queryClient = useQueryClient();
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);

  const query = useQuery({
    queryKey: STORE_LIVE_STATUS_QUERY_KEY(storeId ?? ""),
    queryFn: () => merchantService.getStoreLiveStatusSnapshot(storeId!),
    enabled: !!storeId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!storeId || !query.data) return;
    const {
      liveStatus,
      nextOpenAt,
      nextCloseAt,
      rushActive,
      rushEndsAt,
      rushRemainingMinutes,
    } = query.data;
    setStatusFromApi(storeId, liveStatus === "OPEN", liveStatus);
    patchMerchantDetailLiveStatus(queryClient, storeId, {
      liveStatus,
      nextOpenAt,
      nextCloseAt,
      rushActive,
      rushEndsAt,
      rushRemainingMinutes,
    });
  }, [storeId, query.data, queryClient, setStatusFromApi]);

  return query;
}
