/**
 * Live open/closed for a merchant list item — same resolution as filter/sort counts.
 * Subscribes to statusMap[merchant.id] directly (getStatus() bypasses Zustand tracking).
 */
import { useEffect } from "react";
import type { MerchantSummary } from "@/services/merchant.service";
import { useStoreStatusStore, type LiveStatus } from "@/store/storeStatusStore";
import { resolveMerchantLiveStatus } from "@/lib/merchantListing";

function hasExplicitApiStatus(
  merchant: Pick<MerchantSummary, "liveStatus" | "isOpen">
): boolean {
  const raw = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
  return raw === "OPEN" || raw === "CLOSED" || merchant.isOpen === true || merchant.isOpen === false;
}

export function useMerchantLiveStatus(
  merchant: Pick<MerchantSummary, "id" | "liveStatus" | "isOpen" | "nextOpenAt" | "nextCloseAt">,
  opts?: { seed?: boolean }
): LiveStatus {
  const statusFromMap = useStoreStatusStore((s) => s.statusMap[merchant.id]);
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);
  const apiStatus = resolveMerchantLiveStatus(merchant, {});
  const canSeed = opts?.seed !== false && hasExplicitApiStatus(merchant);

  useEffect(() => {
    // Recently-viewed / incomplete snapshots must not write into statusMap —
    // a stale CLOSED there made discovery cards show Closed while grid/classic
    // (which never mount that rail) stayed OPEN.
    if (!canSeed) return;
    const existing = useStoreStatusStore.getState().statusMap[merchant.id];
    if (existing === "OPEN" && apiStatus !== "OPEN") {
      const raw = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
      if (raw !== "CLOSED") return;
    }
    setStatusFromApi(merchant.id, apiStatus === "OPEN", apiStatus);
  }, [merchant.id, apiStatus, canSeed, merchant.liveStatus, setStatusFromApi]);
  return statusFromMap ?? apiStatus;
}
