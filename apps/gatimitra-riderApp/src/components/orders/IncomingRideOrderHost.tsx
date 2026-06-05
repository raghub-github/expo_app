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
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
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
  const { data: available } = useAvailableOrders();
  const { data: acceptanceSettings } = useRiderOrderAcceptanceSettings();
  const acceptOrder = useAcceptOrder();
  const rejectOrder = useRejectOrder();

  const orders = available ?? EMPTY_ORDERS;
  const rejectedRef = useRef(new Set<string>());
  const expiredRef = useRef(new Set<string>());
  const soundPlayedRef = useRef(new Set<string>());
  const offerShownAtRef = useRef(new Map<string, number>());
  const acceptingRef = useRef(false);
  const [rejectHydrated, setRejectHydrated] = useState(false);
  const [rejectSheetOpen, setRejectSheetOpen] = useState(false);
  const [poolEpoch, setPoolEpoch] = useState(0);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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
    return orders.filter(
      (o) => !rejectedRef.current.has(o.id) && !expiredRef.current.has(o.id)
    );
  }, [orders, poolEpoch, rejectHydrated]);

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
      offerShownAtRef.current.delete(id);
      closeModal();
      setActiveOrderId(null);
      navigateAfterAccept(snap);
    };

    acceptOrder.mutate(acceptRef, {
      onSuccess: finishAccept,
      onError: async (err) => {
        acceptingRef.current = false;

        if (err instanceof ApiError && err.status === 409) {
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
        }

        const payloadObj =
          err instanceof ApiError && err.payload && typeof err.payload === "object"
            ? (err.payload as { error?: unknown; message?: unknown })
            : null;
        const apiMessage =
          payloadObj && typeof payloadObj.error === "string"
            ? payloadObj.error
            : payloadObj && typeof payloadObj.message === "string"
              ? payloadObj.message
              : null;

        Alert.alert(
          t("orders.incoming.acceptFailedTitle", "Could not accept"),
          apiMessage ??
            t("orders.incoming.acceptFailedMessage", "This ride may already be taken.")
        );

        if (err instanceof ApiError && err.status === 409) {
          expiredRef.current.add(id);
          offerShownAtRef.current.delete(id);
          bumpPool();
          closeModal();
          setActiveOrderId(null);
        }
      },
    });
  }, [acceptOrder, activeOrderId, activeOrder, closeModal, t, bumpPool, navigateAfterAccept]);

  const handleExpired = useCallback(() => {
    if (activeOrderId) {
      expiredRef.current.add(activeOrderId);
      offerShownAtRef.current.delete(activeOrderId);
      bumpPool();
    }
    closeModal();
    setActiveOrderId(null);
  }, [activeOrderId, closeModal, bumpPool]);

  if (!isOnDuty) return null;

  return (
    <>
      <IncomingOrderModal
        visible={modalVisible && activeOrder != null}
        order={activeOrder}
        loading={acceptOrder.isPending}
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
