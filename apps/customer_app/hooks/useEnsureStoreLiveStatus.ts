/**
 * When storeId is set and store status is not in storeStatusStore, fetch GET /merchants/:id/live-status
 * and set it. Ensures cart/checkout/group order always show correct OPEN/CLOSED from single source.
 */
import { useEffect, useRef } from "react";
import { merchantService } from "@/services/merchant.service";
import { useStoreStatusStore } from "@/store/storeStatusStore";

export function useEnsureStoreLiveStatus(storeId: string | null) {
  const statusFromMap = useStoreStatusStore((s) =>
    storeId ? (s.statusMap[storeId] ?? null) : null
  );
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!storeId) return;
    if (statusFromMap != null) return;
    if (fetchedRef.current.has(storeId)) return;
    fetchedRef.current.add(storeId);
    merchantService.getStoreLiveStatus(storeId).then((liveStatus) => {
      if (liveStatus) setStatusFromApi(storeId, liveStatus === "OPEN", liveStatus);
    });
  }, [storeId, statusFromMap, setStatusFromApi]);
}
