/**
 * Order detail — loads from merchant-partner food-orders API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMerchantGoBack } from "@/lib/merchantNavigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { printOrderBill } from "@/lib/orderCardActions";
import { useMerchantPrintContext } from "@/hooks/useMerchantPrintContext";
import {
  MerchantRiderTrackingModal,
  isTerminalOrderStatus,
} from "@/components/tracking/MerchantRiderTrackingModal";
import {
  fetchFoodOrder,
  fetchFoodOrderTimeline,
  fetchFoodOrderActions,
  fetchFoodOrderRidersLog,
  type ApiFoodOrder,
  type FoodOrderTimelineEntry,
  type FoodOrderRiderLogEntry,
  type MerchantOrderActionForTimeline,
} from "@/services/ordersApi";
import { apiFoodOrderToTimelineOrder } from "@/lib/merchantVisibleTimeline";
import { getCachedFoodOrder, setCachedFoodOrder } from "@/lib/foodOrderCache";
import {
  getCachedOrderTimeline,
  setCachedOrderTimeline,
} from "@/lib/orderTimelineCache";
import { MerchantOrderVerticalTimeline } from "@/components/order/MerchantOrderVerticalTimeline";
import { OrderItemDetails } from "@/components/order/OrderItemDetails";
import { OrderBillDetails } from "@/components/order/OrderBillDetails";
import { OrderDetailCustomerCard } from "@/components/order/OrderDetailCustomerCard";
import { OrderDetailCustomerSection } from "@/components/order/OrderDetailCustomerSection";
import { OrderDetailInstructionsSection } from "@/components/order/OrderDetailInstructionsSection";
import { OrderDetailRiderCard } from "@/components/order/OrderDetailRiderCard";
import { OrderDetailSkeleton } from "@/components/order/OrderDetailSkeleton";
import { fetchOrderEta, minutesUntil, prepDeadlineIso, type OrderEtaResponse } from "@/services/etaApi";
import { useOrderEtaRealtime } from "@/hooks/useOrderEtaRealtime";
import {
  apiStatusToStage,
  mapApiOrder,
  orderRecordToApiFoodOrder,
  type OrderStage,
} from "@/hooks/useOrders";
import { useOrdersContext } from "@/context/OrdersContext";
import {
  apiFoodOrderToRiderLog,
  isInactiveRiderAssignment,
  orderHasAssignedRider,
  resolveActiveRiderFromLog,
  resolveCancelledRidersFromLog,
  hasMeaningfulRiderRecord,
  orderEverHadRiderAssignment,
} from "@/lib/orderAssignedRider";
import {
  isPostPickupCancellation,
  resolvePostPickupRider,
} from "@/lib/postPickupCancellation";
import { useNearbyDispatchRiders } from "@/hooks/useNearbyDispatchRiders";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  CARD_PADDING,
  FONT_LABEL,
  FONT_SECONDARY,
} from "@/constants/theme";

const STAGE_UI: Record<
  OrderStage,
  { label: string; bg: string; color: string }
> = {
  created: { label: "NEW", bg: GatiMitraMerchant.statusPendingBg, color: GatiMitraMerchant.statusPending },
  preparing: { label: "PREPARING", bg: GatiMitraMerchant.statusPreparingBg, color: GatiMitraMerchant.statusPreparing },
  ready: { label: "READY", bg: "#CCFBF1", color: "#0F766E" },
  picked_up: { label: "DISPATCHED", bg: "#DBEAFE", color: "#1D4ED8" },
  delivered: { label: "DELIVERED", bg: "#22C55E", color: "#FFFFFF" },
  rejected: { label: "REJECTED", bg: "#FEE2E2", color: "#B91C1C" },
  rto: { label: "RTO", bg: "#FFEDD5", color: "#C2410C" },
};

function parseOrdersFoodId(routeId: string): number | null {
  if (!routeId || routeId.startsWith("core-")) return null;
  const n = parseInt(routeId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ActionButton({
  label,
  onPress,
  loading,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.actionBtn,
        isPrimary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
        (pressed || loading) && styles.actionBtnPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : GatiMitraMerchant.primary} />
      ) : (
        <Text style={[styles.actionBtnText, isPrimary && styles.actionBtnTextPrimary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export default function OrderDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const goBack = useMerchantGoBack("/(tabs)/orders");
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { orders: boardOrders, transitionOrder, upsertOrder } = useOrdersContext();
  const printContext = useMerchantPrintContext();

  const routeId = Array.isArray(rawId) ? rawId[0] ?? "" : String(rawId ?? "");
  const ordersFoodId = parseOrdersFoodId(routeId);
  const selectedStoreId = selectedStore?.id ?? null;
  const cachedSeed =
    ordersFoodId != null
      ? getCachedFoodOrder(ordersFoodId, selectedStoreId)
      : undefined;
  const boardSeed = useMemo(() => {
    if (ordersFoodId == null) return null;
    const rec = boardOrders.find((o) => o.id === String(ordersFoodId));
    return rec ? orderRecordToApiFoodOrder(rec) : null;
  }, [boardOrders, ordersFoodId]);
  const storeId =
    cachedSeed?.storeId ??
    (boardSeed && boardOrders.find((o) => o.id === String(ordersFoodId))?.merchantStoreId) ??
    selectedStoreId;

  const [loading, setLoading] = useState(!cachedSeed && !boardSeed);
  const [error, setError] = useState<string | null>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [order, setOrder] = useState<ApiFoodOrder | null>(
    () => cachedSeed?.order ?? boardSeed ?? null
  );
  const [timeline, setTimeline] = useState<FoodOrderTimelineEntry[]>(() =>
    storeId != null && ordersFoodId != null
      ? getCachedOrderTimeline(storeId, ordersFoodId) ?? []
      : []
  );
  const [actions, setActions] = useState<MerchantOrderActionForTimeline[]>([]);
  const [riderReachedAt, setRiderReachedAt] = useState<string | null>(null);
  const [ridersLog, setRidersLog] = useState<FoodOrderRiderLogEntry[]>([]);
  const [activeRider, setActiveRider] = useState<FoodOrderRiderLogEntry | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const actionInFlightRef = useRef(false);
  const loadGenRef = useRef(0);
  const [eta, setEta] = useState<OrderEtaResponse | null>(null);

  const etaOrderIdText = (order?.formatted_order_id ?? "").trim() || null;
  const refreshEtaOnResume = useCallback(async () => {
    if (!etaOrderIdText) return;
    const next = await fetchOrderEta(etaOrderIdText);
    if (next) setEta(next);
  }, [etaOrderIdText]);
  useOrderEtaRealtime({
    enabled: Boolean(token && etaOrderIdText),
    orderIdText: etaOrderIdText,
    token,
    eta,
    setEta,
    onResume: refreshEtaOnResume,
  });

  // Late board arrival (poll finished after mount) — paint immediately, never blank.
  useEffect(() => {
    if (order || !boardSeed || ordersFoodId == null) return;
    setOrder(boardSeed);
    setLoading(false);
    setError(null);
    if (storeId != null) setCachedFoodOrder(storeId, ordersFoodId, boardSeed);
  }, [boardSeed, order, ordersFoodId, storeId]);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const stillCurrent = () => gen === loadGenRef.current;
    if (!token || !storeId || ordersFoodId == null) {
      setLoading(false);
      if (ordersFoodId == null && routeId) {
        setError("This order cannot be opened in the app.");
      } else if (!storeId) {
        setError("Select a store first.");
      }
      return;
    }

    const seed = getCachedFoodOrder(ordersFoodId, storeId)?.order ?? boardSeed;
    const hasSeed = Boolean(seed);
    if (seed) {
      setOrder((prev) => prev ?? seed);
      setCachedFoodOrder(storeId, ordersFoodId, seed);
    }
    if (!hasSeed) setLoading(true);
    setError(null);

    const soft = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return fallback;
      }
    };

    try {
      // Primary order + riders log in parallel so history is ready for the sheet.
      const [o, ridersEarly] = await Promise.all([
        fetchFoodOrder(storeId, ordersFoodId, token),
        soft(fetchFoodOrderRidersLog(storeId, ordersFoodId, token), [] as FoodOrderRiderLogEntry[]),
      ]);
      if (!stillCurrent()) return;
      setCachedFoodOrder(storeId, ordersFoodId, o);
      setOrder(o);
      if (ridersEarly.length > 0) {
        setRidersLog(ridersEarly);
        setRiderReachedAt(
          ridersEarly.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null
        );
        setActiveRider(
          [...ridersEarly]
            .reverse()
            .find((r) => {
              const st = (r.assignment_status ?? "").toUpperCase();
              return st !== "CANCELLED" && st !== "REJECTED" && st !== "UNASSIGNED";
            }) ?? null
        );
      }
      setLoading(false);

      const [tl, act, riders] = await Promise.all([
        soft(
          fetchFoodOrderTimeline(storeId, ordersFoodId, token),
          getCachedOrderTimeline(storeId, ordersFoodId) ?? []
        ),
        soft(fetchFoodOrderActions(storeId, ordersFoodId, token), [] as MerchantOrderActionForTimeline[]),
        soft(fetchFoodOrderRidersLog(storeId, ordersFoodId, token), ridersEarly),
      ]);
      if (!stillCurrent()) return;
      setCachedOrderTimeline(storeId, ordersFoodId, tl);
      setTimeline(tl);
      setActions(act);
      if (riders.length > 0 || ridersEarly.length === 0) {
        setRidersLog(riders);
      }
      const active =
        [...riders]
          .reverse()
          .find((r) => {
            const st = (r.assignment_status ?? "").toUpperCase();
            return st !== "CANCELLED" && st !== "REJECTED" && st !== "UNASSIGNED";
          }) ?? null;
      setActiveRider(active);
      setRiderReachedAt(
        riders.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null
      );

      const idText = (o.formatted_order_id ?? "").trim();
      if (idText && /^GM\d+/i.test(idText)) {
        const etaRes = await soft(fetchOrderEta(idText), null);
        if (!stillCurrent()) return;
        setEta(etaRes);
      } else {
        setEta(null);
      }
    } catch (e) {
      if (!stillCurrent()) return;
      // Never blank the page if anything already painted (cache / board / prior paint).
      let painted = false;
      setOrder((prev) => {
        const next = prev ?? seed ?? null;
        painted = next != null;
        return next;
      });
      if (!painted) {
        setTimeline([]);
        setActions([]);
        setRidersLog([]);
        setRiderReachedAt(null);
        setActiveRider(null);
        setError(e instanceof Error ? e.message : "Failed to load order");
      }
    } finally {
      if (stillCurrent()) setLoading(false);
    }
  }, [token, storeId, ordersFoodId, routeId, boardSeed]);

  useEffect(() => {
    void load();
  }, [load]);

  const stage = useMemo(
    () => (order ? apiStatusToStage(order.order_status) : "created"),
    [order]
  );
  const statusStyle = STAGE_UI[stage];
  const timelineEntries = useMemo(
    () =>
      timeline.map((e) => ({
        status: e.status,
        occurred_at: e.occurred_at,
        status_message: e.status_message,
      })),
    [timeline]
  );

  const prepByIso = prepDeadlineIso(eta);
  const prepMinsLeft = minutesUntil(prepByIso);

  const cancelledRiders = useMemo(
    () => resolveCancelledRidersFromLog(ridersLog),
    [ridersLog]
  );

  const displayRider = useMemo(() => {
    if (!order) return null;
    if (isPostPickupCancellation(order, ridersLog)) {
      return resolvePostPickupRider(ridersLog, order) ?? apiFoodOrderToRiderLog(order);
    }
    const fromLog = resolveActiveRiderFromLog(ridersLog);
    if (fromLog) return fromLog;
    if (activeRider) return activeRider;
    const fromOrder = apiFoodOrderToRiderLog(order);
    if (fromOrder && !isInactiveRiderAssignment(fromOrder.assignment_status, fromOrder.cancelled_at, fromOrder.rejected_at)) {
      return fromOrder;
    }
    // No active rider — if only cancelled history exists, surface the latest cancelled as primary.
    if (cancelledRiders[0]) return cancelledRiders[0];
    return fromOrder;
  }, [activeRider, cancelledRiders, order, ridersLog]);

  const displayRiderReachedAt = riderReachedAt ?? order?.rider_reached_at ?? null;

  const isGatiMitraDelivery =
    String(order?.delivery_type ?? "").toUpperCase() === "GATIMITRA_RIDER";
  const isSelfPickupOrder =
    String(order?.delivery_type ?? "").toUpperCase() === "SELF_PICKUP";

  const hasActiveDisplayRider = Boolean(
    displayRider &&
      !isInactiveRiderAssignment(
        displayRider.assignment_status,
        displayRider.cancelled_at,
        displayRider.rejected_at
      )
  );

  const showPendingAssign =
    isGatiMitraDelivery &&
    !hasActiveDisplayRider &&
    (stage === "preparing" || stage === "ready" || stage === "picked_up");

  const { summary: nearbyRiderSummary } = useNearbyDispatchRiders(
    ordersFoodId,
    showPendingAssign
  );

  const showDeliveryPartner = useMemo(() => {
    if (!order) return false;
    if (isSelfPickupOrder) return true;
    if (!isGatiMitraDelivery) return false;
    if (showPendingAssign) return true;
    const isTerminal = stage === "delivered" || stage === "rejected" || stage === "rto";
    if (isTerminal) return hasMeaningfulRiderRecord(order, ridersLog);
    return orderEverHadRiderAssignment(order, ridersLog);
  }, [isGatiMitraDelivery, isSelfPickupOrder, order, ridersLog, showPendingAssign, stage]);

  const headerSubtitle = useMemo(() => {
    if (!order) return "";
    const id =
      formatOrderIdDisplay(order.formatted_order_id, order.orders_core_id).replace(/^#?/i, "") ||
      String(order.orders_core_id);
    const store = (selectedStore?.store_name ?? "").trim();
    return store ? `ID: ${id}, ${store}` : `ID: ${id}`;
  }, [order, selectedStore?.store_name]);
  const printOrderRecord = useMemo(() => (order ? mapApiOrder(order) : null), [order]);

  const riderOrderRecord = useMemo(() => {
    if (!order) return null;
    const base = mapApiOrder(order, {
      storeId: selectedStore?.id ?? null,
      storeName: selectedStore?.store_name ?? null,
    });
    // Prefer board seed rider fields when detail DTO is missing assignee info.
    const boardRec =
      ordersFoodId != null
        ? boardOrders.find((o) => o.id === String(ordersFoodId))
        : undefined;
    const withBoard = boardRec
      ? {
          ...base,
          riderId: base.riderId ?? boardRec.riderId,
          riderName: base.riderName ?? boardRec.riderName,
          riderMobile: base.riderMobile ?? boardRec.riderMobile,
          riderSelfieUrl: base.riderSelfieUrl ?? boardRec.riderSelfieUrl,
          riderAssignmentStatus: base.riderAssignmentStatus ?? boardRec.riderAssignmentStatus,
          riderReachedAt: base.riderReachedAt ?? boardRec.riderReachedAt,
          reachedMerchantAt: base.reachedMerchantAt ?? boardRec.reachedMerchantAt,
          riderPickedUpAt: base.riderPickedUpAt ?? boardRec.riderPickedUpAt,
          riderDisplayVariant: base.riderDisplayVariant ?? boardRec.riderDisplayVariant,
        }
      : base;
    const active =
      displayRider &&
      !isInactiveRiderAssignment(
        displayRider.assignment_status,
        displayRider.cancelled_at,
        displayRider.rejected_at
      )
        ? displayRider
        : null;
    if (!active) {
      const isTerminal = stage === "rejected" || stage === "rto";
      if (isTerminal) return null;
      const deliveredRider =
        stage === "delivered"
          ? displayRider ??
            ridersLog.find(
              (r) =>
                (r.delivered_at != null ||
                  String(r.assignment_status ?? "").toUpperCase() === "DELIVERED") &&
                !isInactiveRiderAssignment(r.assignment_status, r.cancelled_at, r.rejected_at)
            ) ??
            null
          : null;
      if (deliveredRider) {
        return {
          ...withBoard,
          riderId: deliveredRider.rider_id || withBoard.riderId,
          riderName: (deliveredRider.rider_name ?? "").trim() || withBoard.riderName,
          riderMobile: (deliveredRider.rider_mobile ?? "").trim() || withBoard.riderMobile,
          riderSelfieUrl: deliveredRider.selfie_url ?? withBoard.riderSelfieUrl,
          riderAssignmentStatus:
            deliveredRider.assignment_status || withBoard.riderAssignmentStatus,
          riderReachedAt:
            deliveredRider.reached_merchant_at ??
            displayRiderReachedAt ??
            withBoard.riderReachedAt,
          reachedMerchantAt:
            deliveredRider.reached_merchant_at ?? withBoard.reachedMerchantAt,
          riderPickedUpAt: deliveredRider.picked_up_at ?? withBoard.riderPickedUpAt,
        };
      }
      return orderHasAssignedRider(withBoard) ? withBoard : null;
    }
    return {
      ...withBoard,
      riderId: active.rider_id || withBoard.riderId,
      riderName: (active.rider_name ?? "").trim() || withBoard.riderName,
      riderMobile: (active.rider_mobile ?? "").trim() || withBoard.riderMobile,
      riderSelfieUrl: active.selfie_url ?? withBoard.riderSelfieUrl,
      riderAssignmentStatus: active.assignment_status || withBoard.riderAssignmentStatus,
      riderReachedAt:
        active.reached_merchant_at ?? displayRiderReachedAt ?? withBoard.riderReachedAt,
      reachedMerchantAt: active.reached_merchant_at ?? withBoard.reachedMerchantAt,
      riderPickedUpAt: active.picked_up_at ?? withBoard.riderPickedUpAt,
    };
  }, [
    boardOrders,
    displayRider,
    displayRiderReachedAt,
    order,
    ordersFoodId,
    ridersLog,
    selectedStore?.id,
    selectedStore?.store_name,
    stage,
  ]);

  const refreshTimeline = async (gen = loadGenRef.current) => {
    if (!token || !storeId || ordersFoodId == null) return;
    const [tl, act, riders] = await Promise.all([
      fetchFoodOrderTimeline(storeId, ordersFoodId, token),
      fetchFoodOrderActions(storeId, ordersFoodId, token),
      fetchFoodOrderRidersLog(storeId, ordersFoodId, token),
    ]);
    if (gen !== loadGenRef.current) return;
    setTimeline(tl);
    setActions(act);
    setRidersLog(riders);
    setRiderReachedAt(riders.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null);
    setActiveRider(
      [...riders]
        .reverse()
        .find((r) => {
          const st = (r.assignment_status ?? "").toUpperCase();
          return st !== "CANCELLED" && st !== "REJECTED";
        }) ?? null
    );
  };

  const runBoardAction = async (nextStage: OrderStage) => {
    if (!token || ordersFoodId == null || !order || actionInFlightRef.current) return;
    const gen = loadGenRef.current;
    actionInFlightRef.current = true;
    setActionLoading(true);
    try {
      upsertOrder(
        mapApiOrder(order, {
          storeId: storeId ?? undefined,
          storeName: selectedStore?.store_name ?? null,
        })
      );
      const applied = await transitionOrder(String(ordersFoodId), nextStage);
      if (!applied) return;
      if (gen !== loadGenRef.current) return;
      const cached = getCachedFoodOrder(ordersFoodId, storeId)?.order;
      if (cached) setOrder(cached);
      await refreshTimeline(gen);
      setError(null);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      actionInFlightRef.current = false;
      if (gen === loadGenRef.current) setActionLoading(false);
    }
  };

  const showAccept = stage === "created";
  const showMarkReady = stage === "preparing";
  const showDispatch =
    stage === "ready" && order?.delivery_type !== "GATIMITRA_RIDER";
  const showComplete =
    stage === "picked_up" && order?.delivery_type !== "GATIMITRA_RIDER";

  if (!routeId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={goBack} style={[styles.backBtn, GatiMitraMerchant.cursorPointer]}>
          <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <Text style={styles.empty}>Order not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }, GatiMitraMerchant.cursorPointer]}
        >
          <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Order details</Text>
          {order && headerSubtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        {order ? (
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                if (!printOrderRecord) return;
                void printOrderBill(printOrderRecord, printContext);
              }}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }, GatiMitraMerchant.cursorPointer]}
              accessibilityRole="button"
              accessibilityLabel="Print order bill"
            >
              <Ionicons name="print-outline" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading && !order ? (
          <OrderDetailSkeleton />
        ) : error && !order ? (
          <View style={styles.card}>
            <Text style={styles.errorTitle}>Could not load order</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : order ? (
          <>
            <View style={{ marginHorizontal: H_PADDING, marginTop: 14 }}>
              <OrderDetailCustomerCard
                order={order}
                stage={stage}
                statusStyle={statusStyle}
                storeName={selectedStore?.store_name}
                prepBanner={
                  prepByIso ? (
                    <View style={styles.prepBanner}>
                      <Ionicons name="alarm" size={18} color="#c2410c" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.prepBannerTitle}>
                          Hand to rider by{" "}
                          {new Date(prepByIso).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {prepMinsLeft != null
                            ? prepMinsLeft <= 0
                              ? " · OVERDUE"
                              : ` · ${prepMinsLeft} min left`
                            : ""}
                        </Text>
                        {(eta?.firstEtaAt || eta?.promise.promisedDeliveryAt) ? (
                          <Text style={styles.prepBannerSub}>
                            Customer promised by{" "}
                            {new Date(
                              eta.firstEtaAt || eta.promise.promisedDeliveryAt!
                            ).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null
                }
              />
            </View>

            {showDeliveryPartner ? (
              <View style={{ marginHorizontal: H_PADDING, marginTop: 18 }}>
                <OrderDetailRiderCard
                  rider={displayRider}
                  ridersLog={ridersLog}
                  orderRecord={riderOrderRecord}
                  deliveryType={order.delivery_type}
                  riderReachedAt={displayRiderReachedAt}
                  orderStage={stage}
                  showPendingAssign={showPendingAssign}
                  nearbySummary={nearbyRiderSummary}
                />
                {displayRider?.rider_id ? (
                  <Pressable
                    onPress={() => setTrackingOpen(true)}
                    style={styles.trackBtn}
                    accessibilityRole="button"
                    hitSlop={6}
                  >
                    <Ionicons name="navigate" size={16} color="#ffffff" />
                    <Text style={styles.trackBtnTxt}>Track rider live</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.detailSection}>
              <OrderDetailCustomerSection order={order} />
            </View>

            <View style={styles.detailSection}>
              <OrderItemDetails order={order} />
              <OrderDetailInstructionsSection
                merchantInstructionsList={order.merchant_instructions_list}
                requiresUtensils={order.requires_utensils}
              />
            </View>

            <View style={styles.detailSection}>
              <OrderBillDetails order={order} />
            </View>

            <View style={styles.timelineSection}>
              <Text style={styles.timelineSectionTitle}>Order timeline</Text>
              <View style={styles.timelineCard}>
                <MerchantOrderVerticalTimeline
                  order={apiFoodOrderToTimelineOrder(order)}
                  timelineEntries={timelineEntries}
                  actions={actions}
                  riderReachedAt={displayRiderReachedAt}
                />
              </View>
            </View>

            <View style={styles.actions}>
              {showAccept ? (
                <ActionButton
                  label="Accept order"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => void runBoardAction("preparing")}
                />
              ) : null}
              {showMarkReady ? (
                <ActionButton
                  label="Mark ready"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => {
                    const st = String(order?.order_status ?? "").toUpperCase();
                    if (st === "READY_FOR_PICKUP" || st === "OUT_FOR_DELIVERY" || st === "DELIVERED") {
                      return;
                    }
                    void runBoardAction("ready");
                  }}
                />
              ) : null}
              {showDispatch ? (
                <ActionButton
                  label="Mark dispatched"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => void runBoardAction("picked_up")}
                />
              ) : null}
              {showComplete ? (
                <ActionButton
                  label="Mark delivered"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => void runBoardAction("delivered")}
                />
              ) : null}
              {stage === "delivered" ? (
                <Text style={styles.completedHint}>This order is completed.</Text>
              ) : null}
              {stage === "rejected" || stage === "rto" ? (
                <Text style={styles.completedHint}>This order was closed.</Text>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      <MerchantRiderTrackingModal
        visible={trackingOpen}
        onClose={() => setTrackingOpen(false)}
        storeId={storeId}
        ordersFoodId={ordersFoodId}
        ended={isTerminalOrderStatus(order?.order_status)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  trackBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 12,
  },
  trackBtnTxt: { color: "#ffffff", fontWeight: "800", fontSize: 14.5 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  headerTitles: { flex: 1, minWidth: 0 },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  backBtn: { padding: 8, marginRight: 4 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 0 },
  card: {
    marginBottom: 14,
    marginHorizontal: H_PADDING,
    marginTop: 14,
    padding: CARD_PADDING,
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  prepBanner: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  prepBannerTitle: { fontSize: 12, fontWeight: "700", color: "#c2410c" },
  prepBannerSub: { fontSize: 11, color: "#9a3412", marginTop: 2 },
  detailSection: {
    marginHorizontal: H_PADDING,
  },
  timelineSection: {
    marginHorizontal: H_PADDING,
    marginTop: 18,
    marginBottom: 14,
  },
  timelineSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  timelineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { marginHorizontal: H_PADDING, marginTop: 4, gap: 10 },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  actionBtnPrimary: { backgroundColor: GatiMitraMerchant.primary },
  actionBtnSecondary: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  actionBtnPressed: { opacity: 0.9 },
  actionBtnText: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  actionBtnTextPrimary: { color: "#FFFFFF" },
  completedHint: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  empty: { padding: H_PADDING, fontSize: FONT_LABEL, color: GatiMitraMerchant.textSecondary },
  muted: { fontSize: FONT_SECONDARY, color: GatiMitraMerchant.textTertiary },
  errorTitle: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary, marginBottom: 8 },
  errorBody: { fontSize: FONT_SECONDARY, color: GatiMitraMerchant.textSecondary, marginBottom: 12 },
  retryBtn: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
