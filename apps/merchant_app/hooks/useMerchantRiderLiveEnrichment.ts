import { useMemo } from "react";
import type { OrderRecord } from "@/hooks/useOrders";
import { canTrackAssignedRider, orderHasAssignedRider } from "@/lib/orderAssignedRider";
import { riderEnRouteToMerchant, resolveRiderCardVariant } from "@/lib/riderMerchantArrivalDisplay";
import { useMerchantRiderLiveTracking } from "@/hooks/useMerchantRiderLiveTracking";

function parseOrdersFoodId(orderId: string): number | null {
  const n = parseInt(orderId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type MerchantRiderLiveEnrichment = {
  riderName: string;
  riderMobile: string | null;
  riderSelfieUrl: string | null;
  assignmentStatus: string | null;
  arrivalSubtitle: string | null;
  loading: boolean;
  wsConnected: boolean;
};

export function useMerchantRiderLiveEnrichment(
  order: OrderRecord,
  storeId: number | null,
  token: string | null,
  enabled: boolean
): MerchantRiderLiveEnrichment {
  const ordersFoodId = parseOrdersFoodId(order.id);
  const variant = resolveRiderCardVariant(order);
  const enRoute = riderEnRouteToMerchant(order);
  const shouldTrack =
    enabled &&
    !!storeId &&
    !!token &&
    ordersFoodId != null &&
    orderHasAssignedRider(order) &&
    canTrackAssignedRider(order) &&
    (enRoute || variant === "arrived" || variant === "picked_up");

  const wsOrderIds = useMemo(() => {
    const ids: string[] = [];
    if (order.formattedOrderId?.trim()) ids.push(order.formattedOrderId.trim());
    if (order.orderNumber?.trim()) ids.push(order.orderNumber.trim());
    return ids;
  }, [order.formattedOrderId, order.orderNumber]);

  const { data: tracking, loading, wsConnected } = useMerchantRiderLiveTracking({
    enabled: shouldTrack,
    storeId,
    ordersFoodId,
    wsOrderIds,
    token,
  });

  const riderName =
    (tracking?.rider.name ?? order.riderName ?? "").trim() || "Delivery partner";
  const riderMobile = (tracking?.rider.mobile ?? order.riderMobile ?? "").trim() || null;
  const riderSelfieUrl = tracking?.rider.selfie_url ?? order.riderSelfieUrl ?? null;

  const arrivalSubtitle =
    enRoute && tracking?.approach?.remaining_distance_m != null
      ? (() => {
          const m = tracking.approach!.remaining_distance_m;
          const eta = tracking.approach!.eta_minutes;
          const km = m / 1000;
          const distLabel =
            km < 1
              ? `${Math.max(50, Math.round(m))} m away`
              : `${(Math.round(km * 10) / 10).toFixed(km % 1 === 0 ? 0 : 1)} km away`;
          const mins =
            eta != null && eta > 0 ? Math.max(1, Math.round(eta)) : Math.max(1, Math.round(km / 0.35));
          return `Arriving in ${mins} min · ${distLabel}`;
        })()
      : null;

  return {
    riderName,
    riderMobile,
    riderSelfieUrl,
    assignmentStatus: tracking?.rider.assignment_status ?? order.riderAssignmentStatus ?? null,
    arrivalSubtitle,
    loading,
    wsConnected,
  };
}
