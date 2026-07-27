// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useDutyStore } from "@/src/stores/dutyStore";
import {
  useAvailableOrders,
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
  showAcceptedByAnotherRiderToast,
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
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { selectedServices: dutySelectedServices } = useRiderDutyServiceFilter();
  const { data: dutyStatus } = useDutyStatus();
  const blockedServices = useMemo(
    () => mergeRiderBlockedServices(dutyStatus?.blockedServiceTypes),
    [dutyStatus?.blockedServiceTypes]
  );
  const { data: available } = useAvailableOrders();
  const { data: acceptanceSettings } = useRiderOrderAcceptanceSettings();
  const acceptOrder = useAcceptOrder();
  const rejectOrder = useRejectOrder();
  const missOrderOffer = useMissOrderOffer();

  const orders = available ?? EMPTY_ORDERS;
  const rejectedRef = useRef(new Set<string>());
  const expiredRef = useRef(new Set<string>());
  const soundPlayedRef = useRef(new Set<string>());
  const locallyAcceptedRef = useRef(new Set<string>());
  const prevAvailableRef = useRef<RiderOrderSummary[]>([]);
  const offerShownAtRef = useRef(new Map<string, number>());
  const acceptingRef = useRef(false);
  const [rejectHydrated, setRejectHydrated] = useState(false);
  const [rejectSheetOpen, setRejectSheetOpen] = useState(false);
  const [acceptSwipeResetKey, setAcceptSwipeResetKey] = useState(0);
  const [poolEpoch, setPoolEpoch] = useState(0);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const activeOrderIdRef = useRef<string | null>(null);

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
    if (!isOnDuty) {
      stopOrderAlertSound();
      setActiveOrderId(null);
      setModalVisible(false);
      expiredRef.current.clear();
      offerShownAtRef.current.clear();
      soundPlayedRef.current.clear();
      bumpPool();
      return;
    }

    if (!poolHeadId) {
      stopOrderAlertSound();
      setActiveOrderId(null);
      setModalVisible(false);
      return;
    }

    markOfferShown(poolHeadId);

    setActiveOrderId((current) => {
      if (
        current &&
        orders.some(
          (o) =>
            o.id === current &&
            !rejectedRef.current.has(o.id) &&
            !expiredRef.current.has(o.id)
        )
      ) {
        return current;
      }
      return poolHeadId;
    });
    setModalVisible(true);
  }, [isOnDuty, poolHeadId, orders, bumpPool, markOfferShown]);

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
    if (!activeOrderId) return;
    setRejectSheetOpen(true);
  }, [activeOrderId]);

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
        router.push(`/active-ride/${encodeURIComponent(order.id)}`);
        return;
      }
      if (order.category === "food") {
        router.push(`/active-food/${encodeURIComponent(order.id)}`);
        return;
      }
      router.push("/(tabs)/orders");
    },
    [queryClient]
  );

  const handleAccept = useCallback(() => {
    if (!activeOrderId || !activeOrder || acceptOrder.isPending || acceptingRef.current) return;
    acceptingRef.current = true;
    const id = activeOrderId;
    const acceptRef = activeOrder.formattedOrderId?.trim() || id;
    const snap = activeOrder;

    const finishAccept = () => {
      acceptingRef.current = false;
      locallyAcceptedRef.current.add(id);
      offerShownAtRef.current.delete(id);
      closeModal();
      setActiveOrderId(null);
      navigateAfterAccept(snap);
    };

    acceptOrder.mutate(acceptRef, {
      onSuccess: (data) => {
        seedRiderOrderDetailCache(queryClient, data, [id, acceptRef]);
        finishAccept();
      },
      onError: async (err) => {
        acceptingRef.current = false;
        const apiMessage = extractRiderAcceptErrorMessage(err);

        if (err instanceof ApiError && err.status === 409) {
          if (isOrderTakenByAnotherRiderError(err)) {
            showAcceptedByAnotherRiderToast(id);
            expiredRef.current.add(id);
            offerShownAtRef.current.delete(id);
            bumpPool();
            closeModal();
            setActiveOrderId(null);
            return;
          }

          // Fast path: if we already own it (retry after timeout), resume nav without extra RTT only when probe finds us.
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
  }, [acceptOrder, activeOrderId, activeOrder, closeModal, t, bumpPool, navigateAfterAccept]);

  const handleExpired = useCallback(() => {
    if (activeOrderId && activeOrder) {
      const orderRef = activeOrder.formattedOrderId?.trim() || activeOrderId;
      missOrderOffer.mutate({ orderId: orderRef, reason: "timer_expired" });
      expiredRef.current.add(activeOrderId);
      offerShownAtRef.current.delete(activeOrderId);
      bumpPool();
    }
    closeModal();
    setActiveOrderId(null);
  }, [activeOrderId, activeOrder, closeModal, bumpPool, missOrderOffer]);

  if (!isOnDuty) return null;

  return (
    <>
      <IncomingOrderModal
        visible={modalVisible && activeOrder != null}
        order={activeOrder}
        loading={acceptOrder.isPending}
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
