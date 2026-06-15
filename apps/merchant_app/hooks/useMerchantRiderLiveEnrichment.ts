import { useCallback, useEffect, useState } from "react";
import type { OrderRecord } from "@/hooks/useOrders";
import {
  fetchMerchantRiderTracking,
  MERCHANT_RIDER_TRACKING_POLL_MS,
  type MerchantRiderTrackingPayload,
} from "@/services/riderTrackingApi";
import { canTrackAssignedRider, orderHasAssignedRider } from "@/lib/orderAssignedRider";
import { riderEnRouteToMerchant, resolveRiderCardVariant } from "@/lib/riderMerchantArrivalDisplay";

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
  const shouldPoll =
    enabled &&
    !!storeId &&
    !!token &&
    ordersFoodId != null &&
    orderHasAssignedRider(order) &&
    canTrackAssignedRider(order) &&
    (enRoute || variant === "arrived" || variant === "picked_up");

  const [tracking, setTracking] = useState<MerchantRiderTrackingPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (silent = true) => {
      if (!shouldPoll || !storeId || !token || ordersFoodId == null) return;
      if (!silent) setLoading(true);
      try {
        const payload = await fetchMerchantRiderTracking(storeId, ordersFoodId, token);
        setTracking(payload);
      } catch {
        /* keep last good payload */
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shouldPoll, storeId, token, ordersFoodId]
  );

  useEffect(() => {
    if (!shouldPoll) {
      setTracking(null);
      return;
    }
    void load(false);
    const id = setInterval(() => void load(true), MERCHANT_RIDER_TRACKING_POLL_MS);
    return () => clearInterval(id);
  }, [shouldPoll, load]);

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
  };
}
