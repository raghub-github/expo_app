/**
 * Live open/closed for a merchant list item — same resolution as filter/sort counts.
 * Subscribes to statusMap[merchant.id] directly (getStatus() bypasses Zustand tracking).
 */
import { useEffect } from "react";
import type { MerchantSummary } from "@/services/merchant.service";
import { useStoreStatusStore, type LiveStatus } from "@/store/storeStatusStore";
import { resolveMerchantLiveStatus } from "@/lib/merchantListing";

export function useMerchantLiveStatus(
  merchant: Pick<MerchantSummary, "id" | "liveStatus" | "nextOpenAt" | "nextCloseAt">
): LiveStatus {
  const statusFromMap = useStoreStatusStore((s) => s.statusMap[merchant.id]);
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const apiStatus = resolveMerchantLiveStatus(merchant, {});

  useEffect(() => {
    setStatusFromApi(merchant.id, apiStatus === "OPEN", apiStatus);
  }, [merchant.id, apiStatus, setStatusFromApi]);
  return statusFromMap ?? apiStatus;
}
