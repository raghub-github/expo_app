// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, InteractionManager } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  useAvailableOrders,
  usePendingOffers,
  useAcceptOrder,
  useRejectOrder,
  useMissOrderOffer,
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
  seedRiderOrderDetailCache,
} from "@/src/hooks/useOrders";
import { useRiderOrderAcceptanceSettings } from "@/src/hooks/useRiderOrderAcceptanceSettings";
import {
  IncomingOrderModal,
  type IncomingDispatchOrder,
} from "@/src/components/orders/IncomingRideOrderModal";
import { RiderRejectReasonSheet } from "@/src/components/orders/RiderRejectReasonSheet";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { riderApi } from "@/src/services/api/riderApi";
import { ApiError } from "@gatimitra/sdk";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";
import {
  loadRiderRejectedOrderIds,
  persistRiderRejectedOrderId,
  pruneRiderRejectedOrderIds,
} from "@/src/lib/riderRejectedOrders";
import { readRiderDeviceOrderAlerts } from "@/src/lib/riderDeviceOrderAlerts";
import {
  playIncomingOrderAlert,
  stopOrderAlertSound,
} from "@/src/lib/playOrderAlertSound";
import {
  subscribeDispatchOfferWithdrawn,
} from "@/src/lib/riderDispatchTakenToast";
import {
  isOrderCategoryDispatchBlocked,
  isOrderCategoryInAllowedDutyServices,
  mergeRiderBlockedServices,
} from "@/src/lib/rider-blocked-services";
import { useRiderDutyServiceFilter } from "@/src/hooks/useRiderDutyServiceFilter";
import { useDutyStatus } from "@/src/hooks/useDutyStatus";
import {
  extractRiderAcceptErrorMessage,
  isOrderNoLongerAvailableError,
  isOrderTakenByAnotherRiderError,
} from "@/src/lib/rider-dispatch-accept-errors";
import {
  classifyRiderActionFailure,
  isRetryableRiderActionError,
  riderActionBusyLabel,
} from "@/src/lib/rider-action-kind";
import {
  findPendingRiderAction,
  useRiderPendingActionStore,
} from "@/src/stores/riderPendingActionStore";
import { detectNewOfferIds, mergeIncomingOfferLists } from "@/src/lib/incomingDispatchOffers";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";
import { cancelIncomingDispatchOffer } from "@/src/lib/ingestIncomingDispatchOffer";
import {
  logAcceptLatency,
  markAcceptLatency,
  setAcceptLatencyOrderId,
} from "@/src/lib/acceptOrderLatency";

const EMPTY_ORDERS: RiderOrderSummary[] = [];

function toIncomingOrder(order: RiderOrderSummary, offerShownAtMs: number): IncomingDispatchOrder {
  return {
    id: order.id,
    category: order.category,
    formattedOrderId: order.formattedOrderId,
    rideType: order.rideType,
    merchantName: order.merchantName,
    itemCount: order.itemCount,
    pickup: order.pickup,
    delivery: order.delivery,
    storeImageUrl: order.storeImageUrl,
    dropAddressImageUrl: order.dropAddressImageUrl,
    distanceKm: order.distanceKm,
    pickupDistanceKm: order.pickupDistanceKm,
    tripDistanceKm: order.tripDistanceKm,
    totalDistanceKm: order.totalDistanceKm,
    estimatedEarning: order.estimatedEarning,
    baseEarning: order.baseEarning,
    customerTipAmount: order.customerTipAmount,
    waitingEarning: order.waitingEarning,
    surgeEarning: order.surgeEarning,
    appliedSurges: order.appliedSurges,
    totalEarning: order.totalEarning,
    higherDispatchPriority: order.higherDispatchPriority,
    createdAt: order.createdAt,
    acceptDeadlineAt: order.acceptDeadlineAt,
    offerShownAtMs,
  };
}

/** Universal incoming dispatch sheet — food, parcel, and ride pool orders. */
export function IncomingRideOrderHost() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { selectedServices: dutySelectedServices } = useRiderDutyServiceFilter();
  const { data: dutyStatus } = useDutyStatus();
  const blockedServices = useMemo(
    () => mergeRiderBlockedServices(dutyStatus?.blockedServiceTypes),
    [dutyStatus?.blockedServiceTypes]
  );
  const { data: available, error: availableError } = useAvailableOrders();
  const { data: pending } = usePendingOffers();
  const ingestCount = useIncomingDispatchOfferStore((s) => s.ingestCount);
  const offerOwnerRiderId = useIncomingDispatchOfferStore((s) => s.ownerRiderId);
  /** Length only — avoid re-rendering host when unrelated cancel-list identity churns. */
  const cancelEpoch = useIncomingDispatchOfferStore((s) => s.cancelledOrderIds.length);
  const { data: acceptanceSettings } = useRiderOrderAcceptanceSettings();
  const acceptOrder = useAcceptOrder();
  const rejectOrder = useRejectOrder();
  const missOrderOffer = useMissOrderOffer();
  useEffect(() => {
    if (ingestCount === 0) return;
    riderDispatchLog("GLOBAL OFFER INGEST", {
      ingestCount,
      lastOfferId: useIncomingDispatchOfferStore.getState().lastOfferId,
    });
  }, [ingestCount]);

  const orders = useMemo(
    () => mergeIncomingOfferLists(available ?? EMPTY_ORDERS, pending ?? EMPTY_ORDERS),
    [available, pending]
  );
  const lastPollSigRef = useRef("");
  useEffect(() => {
    const sig = `${available?.length ?? "x"}:${pending?.length ?? "x"}:${orders.length}`;
    if (sig === lastPollSigRef.current) return;
    lastPollSigRef.current = sig;
    riderDispatchLog("OFFER POLL", {
      available: available?.length ?? null,
      pending: pending?.length ?? null,
      merged: orders.length,
      availableError: availableError ? String(availableError) : null,
    });
  }, [available?.length, pending?.length, orders.length, availableError]);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const rejectedRef = useRef(new Set<string>());
  const expiredRef = useRef(new Set<string>());
  const soundPlayedRef = useRef(new Set<string>());
  const locallyAcceptedRef = useRef(new Set<string>());
  const prevAvailableRef = useRef<RiderOrderSummary[]>([]);
  const seenOfferIdsRef = useRef(new Set<string>());
  const offerShownAtRef = useRef(new Map<string, number>());
  const acceptingRef = useRef(false);
  const [rejectHydrated, setRejectHydrated] = useState(false);
  const [rejectSheetOpen, setRejectSheetOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptSwipeResetKey, setAcceptSwipeResetKey] = useState(0);
  const [acceptBusyLabel, setAcceptBusyLabel] = useState<string | null>(null);
  const [poolEpoch, setPoolEpoch] = useState(0);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const activeOrderIdRef = useRef<string | null>(null);
  const sessionUserRef = useRef<string | null>(null);
  const modalOpenLoggedRef = useRef<string | null>(null);

  useEffect(() => {
    const userKey = session?.userId ?? null;
    if (sessionUserRef.current && sessionUserRef.current !== userKey) {
      seenOfferIdsRef.current = new Set();
      rejectedRef.current = new Set();
      expiredRef.current = new Set();
      soundPlayedRef.current.clear();
      locallyAcceptedRef.current.clear();
      offerShownAtRef.current.clear();
      setActiveOrderId(null);
      setModalVisible(false);
      modalOpenLoggedRef.current = null;
    }
    sessionUserRef.current = userKey;
  }, [session?.userId]);

  useEffect(() => {
    activeOrderIdRef.current = activeOrderId;
  }, [activeOrderId]);

  const bumpPool = useCallback(() => {
    setPoolEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRiderRejectedOrderIds().then((ids) => {
      if (cancelled) return;
      rejectedRef.current = new Set(ids);
      setRejectHydrated(true);
      bumpPool();
    });
    return () => {
      cancelled = true;
    };
  }, [bumpPool]);

  const orderPool = useMemo(() => {
    void poolEpoch;
    if (!rejectHydrated) return [];
    // The backend already restricts dispatch to the rider's on-duty services
    // (duty_logs.service_types via loadOnDutyRiderIds). The client-side selection
    // is only a UX convenience and must NEVER hard-drop a backend-eligible offer:
    // an empty selection means "not yet resolved / show all" (see the reconcile
    // effect in useRiderDutyServiceFilter), never "hide everything". Only apply the
    // selection filter when the rider has an explicit, non-empty choice — otherwise
    // a hydration race or a failed eligible-services fetch would silently swallow
    // every incoming offer. The dispatch-block filter below stays unconditional.
    const hasExplicitSelection = (dutySelectedServices?.length ?? 0) > 0;
    return orders.filter(
      (o) =>
        !rejectedRef.current.has(o.id) &&
        !expiredRef.current.has(o.id) &&
        !useIncomingDispatchOfferStore.getState().isCancelled(o.id) &&
        o.status === "pending" &&
        (!hasExplicitSelection ||
          isOrderCategoryInAllowedDutyServices(o.category, dutySelectedServices)) &&
        !isOrderCategoryDispatchBlocked(
          o.category,
          blockedServices,
          dutyStatus?.allServicesBlacklisted
        )
    );
  }, [
    orders,
    poolEpoch,
    rejectHydrated,
    blockedServices,
    dutySelectedServices,
    dutyStatus?.allServicesBlacklisted,
    cancelEpoch,
  ]);

  const poolHeadId = orderPool[0]?.id ?? null;

  const markOfferShown = useCallback((orderId: string) => {
    if (!offerShownAtRef.current.has(orderId)) {
      offerShownAtRef.current.set(orderId, Date.now());
    }
  }, []);

  const activeOrder = useMemo(() => {
    if (!activeOrderId) return null;
    const hit = orders.find((o) => o.id === activeOrderId);
    if (!hit) return null;
    const offerShownAtMs = offerShownAtRef.current.get(activeOrderId) ?? Date.now();
    return toIncomingOrder(hit, offerShownAtMs);
  }, [activeOrderId, orders]);
  const activeOrderRef = useRef(activeOrder);
  activeOrderRef.current = activeOrder;
  const acceptPending = useRiderPendingActionStore((s) =>
    findPendingRiderAction(
      s.actions,
      "accept",
      activeOrderId,
      activeOrder?.formattedOrderId
    )
  );

  const dismissTakenOffer = useCallback(
    (orderId: string) => {
      const id = orderId.trim();
      if (!id) return;
      stopOrderAlertSound();
      offerShownAtRef.current.delete(id);
      soundPlayedRef.current.delete(id);
      if (activeOrderIdRef.current === id) {
        setModalVisible(false);
        setActiveOrderId(null);
      }
      bumpPool();
    },
    [bumpPool]
  );

  useEffect(() => {
    return subscribeDispatchOfferWithdrawn((orderId) => {
      dismissTakenOffer(orderId);
    });
  }, [dismissTakenOffer]);

  // WS cancel marks cancelledOrderIds — drop the open modal immediately even if
  // the offer is still briefly in the available/pending query cache.
  useEffect(() => {
    if (!activeOrderId) return;
    if (!useIncomingDispatchOfferStore.getState().isCancelled(activeOrderId)) return;
    dismissTakenOffer(activeOrderId);
  }, [activeOrderId, cancelEpoch, dismissTakenOffer]);

  useEffect(() => {
    const prev = prevAvailableRef.current;
    if (prev.length > 0) {
      const currentIds = new Set(orders.map((o) => o.id));
      for (const o of prev) {
        if (currentIds.has(o.id)) continue;
        if (rejectedRef.current.has(o.id)) continue;
        if (expiredRef.current.has(o.id)) continue;
        if (locallyAcceptedRef.current.has(o.id)) continue;
        const wasOffered =
          offerShownAtRef.current.has(o.id) || soundPlayedRef.current.has(o.id);
        if (!wasOffered) continue;
        // Offer vanished from pool — close modal silently. "Taken by another rider"
        // is shown only via WS `accepted_by_other_rider` or accept API 409 proof.
        dismissTakenOffer(o.id);
        expiredRef.current.add(o.id);
      }
    }
    prevAvailableRef.current = orders;
  }, [orders, dismissTakenOffer]);

  useEffect(() => {
    const liveIds = new Set(orders.map((o) => o.id));
    let changed = false;
    for (const id of [...expiredRef.current]) {
      if (!liveIds.has(id)) {
        expiredRef.current.delete(id);
        changed = true;
      }
    }
    for (const id of [...offerShownAtRef.current.keys()]) {
      if (!liveIds.has(id)) {
        offerShownAtRef.current.delete(id);
      }
    }
    for (const id of [...soundPlayedRef.current]) {
      if (!liveIds.has(id)) {
        soundPlayedRef.current.delete(id);
      }
    }
    void pruneRiderRejectedOrderIds(liveIds).then((pruned) => {
      if (!pruned) return;
      void loadRiderRejectedOrderIds().then((ids) => {
        rejectedRef.current = new Set(ids);
        bumpPool();
      });
    });
    if (changed) bumpPool();
  }, [orders, bumpPool]);

  useEffect(() => {
    const me = session?.riderId?.trim() || session?.userId?.trim() || "";
    if (!session?.accessToken || session.role !== "rider") {
      const stale =
        useIncomingDispatchOfferStore.getState().lastOfferId || activeOrderIdRef.current;
      if (stale) {
        riderDispatchLog("DROP OFFER", { reason: "unauthenticated" });
      }
      stopOrderAlertSound();
      setActiveOrderId(null);
      setModalVisible(false);
      modalOpenLoggedRef.current = null;
      return;
    }
    if (offerOwnerRiderId && me && offerOwnerRiderId !== me && offerOwnerRiderId !== session.userId) {
      riderDispatchLog("DROP OFFER", {
        reason: "rider_mismatch",
        owner: offerOwnerRiderId,
        me,
      });
      stopOrderAlertSound();
      setActiveOrderId(null);
      setModalVisible(false);
      modalOpenLoggedRef.current = null;
      return;
    }

    if (!isOnDuty) {
      stopOrderAlertSound();
      setActiveOrderId(null);
      setModalVisible(false);
      expiredRef.current.clear();
      offerShownAtRef.current.clear();
      soundPlayedRef.current.clear();
      modalOpenLoggedRef.current = null;
      bumpPool();
      return;
    }

    if (!poolHeadId) {
      stopOrderAlertSound();
      setActiveOrderId(null);
      setModalVisible(false);
      modalOpenLoggedRef.current = null;
      return;
    }

    const newIds = detectNewOfferIds(
      seenOfferIdsRef.current,
      ordersRef.current.map((o) => o.id)
    );
    for (const id of newIds) seenOfferIdsRef.current.add(id);
    if (newIds.length > 0) {
      riderDispatchLog("OFFER HOST DETECTED", {
        offerId: poolHeadId,
        newOfferIds: newIds,
      });
    }
    markOfferShown(poolHeadId);
    if (modalOpenLoggedRef.current !== poolHeadId) {
      modalOpenLoggedRef.current = poolHeadId;
      riderDispatchLog("MODAL OPENED", { offerId: poolHeadId });
    }

    setActiveOrderId((current) => {
      const list = ordersRef.current;
      const cancelled = useIncomingDispatchOfferStore.getState().cancelledOrderIds;
      const head = list.find((o) => o.id === poolHeadId);
      const headIsForce = head?.higherDispatchPriority === true;
      const currentStillValid =
        !!current &&
        list.some(
          (o) =>
            o.id === current &&
            !rejectedRef.current.has(o.id) &&
            !expiredRef.current.has(o.id) &&
            !cancelled.includes(o.id)
        );
      // Stick to the open sheet unless a higher-priority Force Assignment arrives.
      if (currentStillValid && !(headIsForce && current !== poolHeadId)) {
        return current;
      }
      return poolHeadId;
    });
    setModalVisible(true);
  }, [
    session?.accessToken,
    session?.role,
    session?.userId,
    session?.riderId,
    offerOwnerRiderId,
    isOnDuty,
    poolHeadId,
    bumpPool,
    markOfferShown,
  ]);

  useEffect(() => {
    if (!isOnDuty || !modalVisible || !poolHeadId || !acceptanceSettings) return;
    if (soundPlayedRef.current.has(poolHeadId)) return;
    soundPlayedRef.current.add(poolHeadId);
    void playIncomingOrderAlert(acceptanceSettings, readRiderDeviceOrderAlerts());
  }, [isOnDuty, modalVisible, poolHeadId, acceptanceSettings]);

  useEffect(() => {
    return () => {
      stopOrderAlertSound();
    };
  }, []);

  const closeModal = useCallback(() => {
    stopOrderAlertSound();
    setModalVisible(false);
  }, []);

  const handleRejectPress = useCallback(() => {
    if (!activeOrderIdRef.current) return;
    setRejectSheetOpen(true);
  }, []);

  const handleRejectReason = useCallback(
    (reasonCode: string, reasonText: string) => {
      if (!activeOrderId) return;
      const id = activeOrderId;
      rejectedRef.current.add(id);
      offerShownAtRef.current.delete(id);
      void persistRiderRejectedOrderId(id);
      bumpPool();
      closeModal();
      setActiveOrderId(null);
      setRejectSheetOpen(false);
      rejectOrder.mutate(
        { orderId: id, reasonCode, reasonText },
        {
          onError: () => {
            Alert.alert(
              t("orders.reject.failedTitle", "Could not reject"),
              t("orders.reject.failedMessage", "Please try again.")
            );
          },
        }
      );
    },
    [activeOrderId, closeModal, rejectOrder, bumpPool, t]
  );

  /** Incoming accept → open live nav. Cold start / app reopen does NOT auto-enter (see ActiveOrderResumeBootstrap). */
  const navigateAfterAccept = useCallback(
    (order: IncomingDispatchOrder) => {
      const active =
        queryClient.getQueryData<RiderOrderSummary[]>(RIDER_ACTIVE_ORDERS_QUERY_KEY) ?? [];
      const otherActive = active.filter(isActiveRiderOrder).filter((o) => {
        const ref = order.formattedOrderId?.trim() || order.id;
        return o.id !== order.id && o.formattedOrderId?.trim() !== ref && o.id !== ref;
      });
      // Rider already on a trip — stack the new order without hijacking navigation.
      if (otherActive.length > 0) return;

      if (order.category === "ride") {
        markAcceptLatency("T11_NAVIGATION_START");
        logAcceptLatency();
        router.push(`/active-ride/${encodeURIComponent(order.id)}`);
        return;
      }
      if (order.category === "food") {
        markAcceptLatency("T11_NAVIGATION_START");
        logAcceptLatency();
        router.push(`/active-food/${encodeURIComponent(order.id)}`);
        return;
      }
      markAcceptLatency("T11_NAVIGATION_START");
      logAcceptLatency();
      router.push("/(tabs)/orders");
    },
    [queryClient]
  );

  const acceptMutate = acceptOrder.mutate;
  const handleAccept = useCallback(() => {
    const id = activeOrderIdRef.current;
    const order = activeOrderRef.current;
    if (!id || !order || acceptingRef.current) return;
    acceptingRef.current = true;
    riderDispatchLog("ACCEPT_REQUEST_START", { orderId: id });
    markAcceptLatency("T1_HANDLER");
    setAcceptLatencyOrderId(id);
    const acceptRef = order.formattedOrderId?.trim() || id;
    const snap = order;

    const finishAccept = () => {
      acceptingRef.current = false;
      markAcceptLatency("T9_SUCCESS_STATE");
      locallyAcceptedRef.current.add(id);
      offerShownAtRef.current.delete(id);
      useIncomingDispatchOfferStore.getState().clearOfferId(id);
      closeModal();
      markAcceptLatency("T10_MODAL_CLOSE");
      setActiveOrderId(null);
      setAccepting(false);
      setAcceptBusyLabel(null);
      navigateAfterAccept(snap);
      InteractionManager.runAfterInteractions(() => {
        void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      });
    };

    acceptMutate(acceptRef, {
      onSuccess: (data) => {
        riderDispatchLog("ACCEPT_RESPONSE_RECEIVED", { orderId: id, status: "ok" });
        riderDispatchLog("ORDER_ASSIGNED", { orderId: id });
        seedRiderOrderDetailCache(queryClient, data, [id, acceptRef]);
        finishAccept();
      },
      onError: async (err) => {
        if (isRetryableRiderActionError(err) || classifyRiderActionFailure(err) === "busy") {
          acceptingRef.current = true;
          setAccepting(true);
          const kind = classifyRiderActionFailure(err);
          setAcceptBusyLabel(
            kind === "timeout"
              ? t("orders.incoming.checkingStatus", "Connection lost. Checking order status...")
              : t("orders.incoming.waitingConnection", "Waiting for connection...")
          );
          return;
        }

        acceptingRef.current = false;
        setAccepting(false);
        setAcceptBusyLabel(null);
        riderDispatchLog("ACCEPT_RESPONSE_RECEIVED", {
          orderId: id,
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        const apiMessage = extractRiderAcceptErrorMessage(err);

        if (err instanceof ApiError && err.status === 409) {
          if (isOrderTakenByAnotherRiderError(err)) {
            cancelIncomingDispatchOffer(queryClient, id, "accept_409");
            expiredRef.current.add(id);
            offerShownAtRef.current.delete(id);
            bumpPool();
            closeModal();
            setActiveOrderId(null);
            return;
          }

          try {
            const active = await riderApi.getActiveOrders();
            const hit = active.find(
              (o) =>
                o.id === id ||
                o.id === acceptRef ||
                (snap.formattedOrderId && o.formattedOrderId === snap.formattedOrderId)
            );
            if (hit) {
              finishAccept();
              return;
            }
          } catch {
            /* ignore recovery probe */
          }

          Alert.alert(
            t("orders.incoming.acceptFailedTitle", "Could not accept"),
            isOrderNoLongerAvailableError(err)
              ? t(
                  "orders.incoming.orderNoLongerAvailable",
                  "This order is no longer available."
                )
              : apiMessage ??
                  t(
                    "orders.incoming.acceptUnavailableMessage",
                    "Could not accept this order. Please try another offer."
                  )
          );
          expiredRef.current.add(id);
          offerShownAtRef.current.delete(id);
          bumpPool();
          closeModal();
          setActiveOrderId(null);
          return;
        }

        Alert.alert(
          t("orders.incoming.acceptFailedTitle", "Could not accept"),
          apiMessage ??
            t(
              "orders.incoming.acceptRetryMessage",
              "Something went wrong. Check your connection and try again."
            )
        );
        setAcceptSwipeResetKey((k) => k + 1);
      },
    });
    setAccepting(true);
    setAcceptBusyLabel(t("orders.incoming.accepting", "Accepting..."));
  }, [acceptMutate, closeModal, t, bumpPool, navigateAfterAccept, queryClient]);

  useEffect(() => {
    if (!acceptPending) return;
    const label = riderActionBusyLabel(
      acceptPending.phase,
      t("orders.incoming.accepting", "Accepting..."),
      t("orders.incoming.waitingConnection", "Waiting for connection..."),
      t("orders.incoming.checkingStatus", "Connection lost. Checking order status...")
    );
    if (label) setAcceptBusyLabel(label);
  }, [acceptPending, t]);

  useEffect(() => {
    if (!acceptingRef.current) return;
    if (acceptPending) return;
    const id = activeOrderIdRef.current;
    const snap = activeOrderRef.current;
    if (!id || !snap) return;
    const active =
      queryClient.getQueryData<RiderOrderSummary[]>(RIDER_ACTIVE_ORDERS_QUERY_KEY) ?? [];
    const hit = active.find(
      (o) =>
        o.id === id ||
        o.id === snap.formattedOrderId ||
        (snap.formattedOrderId && o.formattedOrderId === snap.formattedOrderId)
    );
    if (hit) {
      seedRiderOrderDetailCache(queryClient, hit, [id, snap.formattedOrderId ?? ""]);
      acceptingRef.current = false;
      locallyAcceptedRef.current.add(id);
      offerShownAtRef.current.delete(id);
      useIncomingDispatchOfferStore.getState().clearOfferId(id);
      closeModal();
      setActiveOrderId(null);
      setAccepting(false);
      setAcceptBusyLabel(null);
      navigateAfterAccept(snap);
    }
  }, [acceptPending, closeModal, navigateAfterAccept, queryClient]);

  const handleExpired = useCallback(() => {
    const id = activeOrderIdRef.current;
    const order = activeOrderRef.current;
    if (id && order) {
      const orderRef = order.formattedOrderId?.trim() || id;
      missOrderOffer.mutate({ orderId: orderRef, reason: "timer_expired" });
      expiredRef.current.add(id);
      offerShownAtRef.current.delete(id);
      bumpPool();
    }
    closeModal();
    setActiveOrderId(null);
  }, [closeModal, bumpPool, missOrderOffer]);

  if (!isOnDuty) return null;

  return (
    <>
      <IncomingOrderModal
        visible={modalVisible && activeOrder != null}
        order={activeOrder}
        loading={accepting || !!acceptPending}
        loadingLabel={acceptBusyLabel}
        acceptSwipeResetKey={acceptSwipeResetKey}
        onAccept={handleAccept}
        onReject={handleRejectPress}
        onExpired={handleExpired}
      />
      <RiderRejectReasonSheet
        visible={rejectSheetOpen}
        loading={rejectOrder.isPending}
        onClose={() => setRejectSheetOpen(false)}
        onSelect={handleRejectReason}
      />
    </>
  );
}
