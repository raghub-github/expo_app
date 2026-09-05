/**
 * Reorder eligibility: store must be OPEN and delivery-serviceable for the
 * customer's current location / address (same store-quote locality logic).
 *
 * Do not call the hook per history card — that fires N live-status + store-quote
 * requests and blocks order list/detail on HTTP/1.1. Check on Reorder tap instead.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStoreDeliveryQuote } from "@/hooks/useStoreDeliveryQuote";
import { getStoreDeliveryQuote } from "@/services/distance.service";
import { merchantService } from "@/services/merchant.service";
import { useStoreStatusStore } from "@/store/storeStatusStore";

export type ReorderGateReason =
  | "loading"
  | "ok"
  | "out_of_zone"
  | "store_closed"
  | "unavailable";

export async function checkReorderStoreEligibility(input: {
  storeId: string | null;
  deliveryAddressId: number | null;
  dropCoords: { latitude: number; longitude: number } | null;
}): Promise<ReorderGateReason> {
  const storeId = input.storeId?.trim() || null;
  const hasDeliveryAnchor = input.deliveryAddressId != null || input.dropCoords != null;
  if (!storeId || !hasDeliveryAnchor) return "unavailable";

  const [live, quote] = await Promise.all([
    merchantService.getStoreLiveStatusSnapshot(storeId).catch(() => null),
    getStoreDeliveryQuote({
      storeId,
      addressId: input.deliveryAddressId ?? undefined,
      drop:
        input.deliveryAddressId == null && input.dropCoords
          ? { lat: input.dropCoords.latitude, lng: input.dropCoords.longitude }
          : undefined,
    }).catch(() => null),
  ]);

  if (quote?.serviceable === false) return "out_of_zone";
  if (live?.liveStatus === "CLOSED") return "store_closed";
  if (quote?.serviceable !== true) return "unavailable";
  if (live?.liveStatus !== "OPEN") return "unavailable";
  return "ok";
}

export function useReorderStoreEligibility(input: {
  storeId: string | null;
  delivered: boolean;
  deliveryAddressId: number | null;
  dropCoords: { latitude: number; longitude: number } | null;
}): {
  canReorder: boolean;
  reason: ReorderGateReason;
} {
  const storeId = input.storeId?.trim() || null;
  const hasDeliveryAnchor = input.deliveryAddressId != null || input.dropCoords != null;
  const enabled = input.delivered && !!storeId && hasDeliveryAnchor;

  const { data: storeQuote, isPending: quotePending, isFetching: quoteFetching } =
    useStoreDeliveryQuote({
      storeId: storeId ?? "",
      addressId: input.deliveryAddressId,
      drop:
        input.deliveryAddressId == null && input.dropCoords
          ? { lat: input.dropCoords.latitude, lng: input.dropCoords.longitude }
          : null,
      enabled,
    });

  const statusFromMap = useStoreStatusStore((s) =>
    storeId ? (s.statusMap[storeId] ?? null) : null
  );
  const setStatusFromApi = useStoreStatusStore((s) => s.setStatusFromApi);

  const { data: liveSnapshot, isPending: statusPending } = useQuery({
    queryKey: ["store-live-status", storeId],
    queryFn: () => merchantService.getStoreLiveStatusSnapshot(storeId!),
    enabled: enabled && !!storeId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!storeId || !liveSnapshot?.liveStatus) return;
    setStatusFromApi(storeId, liveSnapshot.liveStatus === "OPEN", liveSnapshot.liveStatus);
  }, [storeId, liveSnapshot?.liveStatus, setStatusFromApi]);

  const liveStatus = liveSnapshot?.liveStatus ?? statusFromMap;
  const quoteLoading = enabled && (quotePending || (quoteFetching && storeQuote == null));
  const statusLoading = enabled && statusPending && liveStatus == null;

  if (!input.delivered || !storeId || !hasDeliveryAnchor) {
    return { canReorder: false, reason: "unavailable" };
  }
  if (quoteLoading || statusLoading) {
    return { canReorder: false, reason: "loading" };
  }
  if (storeQuote?.serviceable === false) {
    return { canReorder: false, reason: "out_of_zone" };
  }
  if (storeQuote?.serviceable !== true) {
    return { canReorder: false, reason: "unavailable" };
  }
  if (liveStatus === "CLOSED") {
    return { canReorder: false, reason: "store_closed" };
  }
  if (liveStatus !== "OPEN") {
    return { canReorder: false, reason: "unavailable" };
  }
  return { canReorder: true, reason: "ok" };
}
