import type { QueryClient } from "@tanstack/react-query";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  RIDER_AVAILABLE_ORDERS_QUERY_KEY,
  RIDER_PENDING_OFFERS_QUERY_KEY,
} from "@/src/hooks/useOrders";
import { dropOfferFromLists } from "@/src/lib/incomingDispatchOffers";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";
import { closeIncomingOfferFromRealtime } from "@/src/lib/riderDispatchTakenToast";
import {
  isRiderDispatchLifecycleActive,
  recoverDispatchOffers,
} from "@/src/lib/riderDispatchLifecycle";

function dropOfferFromCaches(queryClient: QueryClient, orderId: string): void {
  queryClient.setQueryData(
    RIDER_AVAILABLE_ORDERS_QUERY_KEY,
    (prev: RiderOrderSummary[] | undefined) => dropOfferFromLists(prev, orderId)
  );
  queryClient.setQueryData(
    RIDER_PENDING_OFFERS_QUERY_KEY,
    (prev: RiderOrderSummary[] | undefined) => dropOfferFromLists(prev, orderId)
  );
}

/**
 * Event-driven ingest: WS / FCM / reconnect all funnel here so Home-local
 * query identity cannot swallow a new offer_id.
 */
export function ingestIncomingDispatchOffer(
  queryClient: QueryClient,
  orderId: string | undefined,
  source: string
): void {
  const id = String(orderId ?? "").trim();
  if (!id) {
    // Empty snapshots (ws_open / foreground) must not abort an in-flight
    // /available recover. Lifecycle already recovers on ws_reconnect + app_foreground.
    riderDispatchLog("OFFER STATE UPDATED", { orderId: null, source });
    return;
  }
  if (useIncomingDispatchOfferStore.getState().isCancelled(id)) {
    riderDispatchLog("STALE_OFFER_DROPPED", { orderId: id, source });
    dropOfferFromCaches(queryClient, id);
    return;
  }
  const session = useSessionStore.getState().session;
  const riderId = session?.riderId?.trim() || session?.userId?.trim() || null;
  const added = useIncomingDispatchOfferStore.getState().ingestOfferId(id, riderId);
  if (!added) {
    riderDispatchLog("STALE_OFFER_DROPPED", { orderId: id, source });
    return;
  }
  riderDispatchLog("OFFER_RECEIVED", { orderId: id, source });
  riderDispatchLog("OFFER STATE UPDATED", { orderId: id, source });
  if (isRiderDispatchLifecycleActive()) {
    void recoverDispatchOffers(`ingest:${source}`, { force: true });
    return;
  }
  void queryClient.refetchQueries({ queryKey: RIDER_PENDING_OFFERS_QUERY_KEY, type: "all" });
  void queryClient.refetchQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY, type: "all" });
}

/** Instant single-winner / order-cancelled close — do not wait for HTTP recovery. */
export function cancelIncomingDispatchOffer(
  queryClient: QueryClient,
  orderId: string | undefined,
  source: string,
  opts?: { reason?: string | null }
): void {
  const id = String(orderId ?? "").trim();
  if (!id) return;
  const store = useIncomingDispatchOfferStore.getState();
  const already = store.isCancelled(id);
  store.cancelOffer(id);
  dropOfferFromCaches(queryClient, id);
  riderDispatchLog("OFFER_CANCELLED", {
    orderId: id,
    source,
    reason: opts?.reason ?? null,
  });
  riderDispatchLog("OFFER_REMOVED", { orderId: id, source });
  riderDispatchLog("MODAL_CLOSED", {
    orderId: id,
    source,
    reason: opts?.reason ?? "offer_cancelled",
  });
  if (!already) {
    closeIncomingOfferFromRealtime(id, opts?.reason ?? source);
  }
}
