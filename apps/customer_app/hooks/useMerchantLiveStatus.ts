/**
 * Live open/closed for a merchant list item — same resolution as filter/sort counts.
 * Subscribes to statusMap[merchant.id] directly (getStatus() bypasses Zustand tracking).
 */
import { useEffect } from "react";
import type { MerchantSummary } from "@/services/merchant.service";
import { useStoreStatusStore, type LiveStatus } from "@/store/storeStatusStore";

export function useMerchantLiveStatus(
  merchant: Pick<MerchantSummary, "id" | "liveStatus">
): LiveStatus {
  const statusFromMap = useStoreStatusStore((s) => s.statusMap[merchant.id]);
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);

  const rawApi = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
  const apiStatus: LiveStatus | null =
    rawApi === "OPEN" ? "OPEN" : rawApi === "CLOSED" ? "CLOSED" : null;

  useEffect(() => {
    if (apiStatus) {
      setStatusFromApi(merchant.id, apiStatus === "OPEN", apiStatus);
    }
  }, [merchant.id, apiStatus, setStatusFromApi]);

  return statusFromMap ?? apiStatus ?? "CLOSED";
}
