/**
 * Order detail — loads from merchant-partner food-orders API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { printKot } from "@/lib/printKot";
import { buildKotPrintContext } from "@/lib/printContext";
import { useMerchantPrintContext } from "@/hooks/useMerchantPrintContext";
import {
  fetchFoodOrder,
  fetchFoodOrderTimeline,
  fetchFoodOrderActions,
  fetchFoodOrderRidersLog,
  patchFoodOrderStatus,
  type ApiFoodOrder,
  type FoodOrderTimelineEntry,
  type FoodOrderRiderLogEntry,
  type MerchantOrderActionForTimeline,
} from "@/services/ordersApi";
import { apiFoodOrderToTimelineOrder } from "@/lib/merchantVisibleTimeline";
import { MerchantOrderVerticalTimeline } from "@/components/order/MerchantOrderVerticalTimeline";
import { OrderItemDetails } from "@/components/order/OrderItemDetails";
import { OrderBillDetails } from "@/components/order/OrderBillDetails";
import { OrderDetailCustomerCard } from "@/components/order/OrderDetailCustomerCard";
import { OrderDetailRiderCard } from "@/components/order/OrderDetailRiderCard";
import { OrderDetailSkeleton } from "@/components/order/OrderDetailSkeleton";
import { OrderDetailOtpRow } from "@/components/order/OrderDetailOtpRow";
import { FormattedOrderId } from "@/components/order/FormattedOrderId";
import { fetchOrderEta, minutesUntil, prepDeadlineIso, type OrderEtaResponse } from "@/services/etaApi";
import { apiStatusToStage, type OrderStage } from "@/hooks/useOrders";
import { apiFoodOrderToRiderLog } from "@/lib/orderAssignedRider";
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
  created: { label: "New", bg: GatiMitraMerchant.statusPendingBg, color: GatiMitraMerchant.statusPending },
  preparing: { label: "Preparing", bg: GatiMitraMerchant.statusPreparingBg, color: GatiMitraMerchant.statusPreparing },
  ready: { label: "Ready", bg: "#CCFBF1", color: "#0F766E" },
  picked_up: { label: "Dispatched", bg: "#DBEAFE", color: "#1D4ED8" },
  delivered: { label: "Delivered", bg: GatiMitraMerchant.statusCompletedBg, color: GatiMitraMerchant.statusCompleted },
  rejected: { label: "Cancelled", bg: "#FEE2E2", color: "#DC2626" },
  rto: { label: "RTO", bg: "#FFEDD5", color: "#EA580C" },
};

function parseOrdersFoodId(routeId: string): number | null {
  if (!routeId || routeId.startsWith("core-")) return null;
  const n = parseInt(routeId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function paymentLabel(method: string | null | undefined): string {
  const m = (method ?? "").trim();
  if (!m) return "—";
  return m;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, !value || value === "—" ? styles.detailMuted : null]}>
        {value || "—"}
      </Text>
    </View>
  );
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const printContext = useMerchantPrintContext();

  const routeId = id ?? "";
  const ordersFoodId = parseOrdersFoodId(routeId);
  const storeId = selectedStore?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<ApiFoodOrder | null>(null);
  const [timeline, setTimeline] = useState<FoodOrderTimelineEntry[]>([]);
  const [actions, setActions] = useState<MerchantOrderActionForTimeline[]>([]);
  const [riderReachedAt, setRiderReachedAt] = useState<string | null>(null);
  const [activeRider, setActiveRider] = useState<FoodOrderRiderLogEntry | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const markReadyInFlightRef = useRef(false);
  const [eta, setEta] = useState<OrderEtaResponse | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId || ordersFoodId == null) {
      setLoading(false);
      if (ordersFoodId == null && routeId) {
        setError("This order cannot be opened in the app.");
      } else if (!storeId) {
        setError("Select a store first.");
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [o, tl, act, riders] = await Promise.all([
        fetchFoodOrder(storeId, ordersFoodId, token),
        fetchFoodOrderTimeline(storeId, ordersFoodId, token),
        fetchFoodOrderActions(storeId, ordersFoodId, token),
        fetchFoodOrderRidersLog(storeId, ordersFoodId, token),
      ]);
      setOrder(o);
      setTimeline(tl);
      setActions(act);
      const active =
        [...riders]
          .reverse()
          .find((r) => {
            const st = (r.assignment_status ?? "").toUpperCase();
            return st !== "CANCELLED" && st !== "REJECTED";
          }) ?? null;
      setActiveRider(active);
      const reached =
        riders.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null;
      setRiderReachedAt(reached);

      const idText = (o.formatted_order_id ?? "").trim();
      if (idText && /^GM\d+/i.test(idText)) {
        const etaRes = await fetchOrderEta(idText);
        setEta(etaRes);
      } else {
        setEta(null);
      }
    } catch (e) {
      setOrder(null);
      setTimeline([]);
      setActions([]);
      setRiderReachedAt(null);
      setActiveRider(null);
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [token, storeId, ordersFoodId, routeId]);

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
  const displayRider = useMemo(
    () => activeRider ?? (order ? apiFoodOrderToRiderLog(order) : null),
    [activeRider, order]
  );
  const displayRiderReachedAt = riderReachedAt ?? order?.rider_reached_at ?? null;

  const runAction = async (nextApiStatus: string) => {
    if (!token || !storeId || ordersFoodId == null || !order) return;
    setActionLoading(true);
    try {
      const updated = await patchFoodOrderStatus(storeId, ordersFoodId, token, nextApiStatus, undefined, {
        action_source: "app",
        accept_mode: "manual",
      });
      setOrder(updated);
      const [tl, act, riders] = await Promise.all([
        fetchFoodOrderTimeline(storeId, ordersFoodId, token),
        fetchFoodOrderActions(storeId, ordersFoodId, token),
        fetchFoodOrderRidersLog(storeId, ordersFoodId, token),
      ]);
      setTimeline(tl);
      setActions(act);
      setRiderReachedAt(riders.find((r) => r.reached_merchant_at)?.reached_merchant_at ?? null);
      setActiveRider(
        [...riders]
          .reverse()
          .find((r) => {
            const st = (r.assignment_status ?? "").toUpperCase();
            return st !== "CANCELLED" && st !== "REJECTED";
          }) ?? null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(false);
    }
  };

  const refreshTimeline = async () => {
    if (!token || !storeId || ordersFoodId == null) return;
    const [tl, act, riders] = await Promise.all([
      fetchFoodOrderTimeline(storeId, ordersFoodId, token),
      fetchFoodOrderActions(storeId, ordersFoodId, token),
      fetchFoodOrderRidersLog(storeId, ordersFoodId, token),
    ]);
    setTimeline(tl);
    setActions(act);
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

  const showAccept = stage === "created";
  const showMarkReady = stage === "preparing";
  const showDispatch =
    stage === "ready" && order?.delivery_type !== "GATIMITRA_RIDER";
  const showComplete =
    stage === "picked_up" && order?.delivery_type !== "GATIMITRA_RIDER";

  if (!routeId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, GatiMitraMerchant.cursorPointer]}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <Text style={styles.empty}>Order not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }, GatiMitraMerchant.cursorPointer]}
        >
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Order details</Text>
          {order && !loading ? (
            <FormattedOrderId
              formattedOrderId={order.formatted_order_id}
              fallbackCoreId={order.orders_core_id}
              fallbackFoodId={order.orders_food_id}
              size="md"
              showHash
            />
          ) : null}
        </View>
        {order && !loading ? (
          <Pressable
            onPress={() => void printKot(order, buildKotPrintContext(printContext))}
            style={({ pressed }) => [styles.kotBtn, pressed && { opacity: 0.7 }, GatiMitraMerchant.cursorPointer]}
            accessibilityRole="button"
            accessibilityLabel="Print kitchen order ticket"
          >
            <Ionicons name="restaurant-outline" size={16} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.kotBtnText}>KOT</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <OrderDetailSkeleton />
        ) : error ? (
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
                        {eta?.promise.promisedDeliveryAt ? (
                          <Text style={styles.prepBannerSub}>
                            Customer promised by{" "}
                            {new Date(eta.promise.promisedDeliveryAt).toLocaleTimeString(undefined, {
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

            <View style={styles.detailSection}>
              <OrderItemDetails order={order} />
            </View>

            <View style={styles.detailSection}>
              <OrderBillDetails order={order} />
            </View>

            <View style={{ marginHorizontal: H_PADDING }}>
              <OrderDetailRiderCard
                rider={displayRider}
                deliveryType={order.delivery_type}
                riderReachedAt={displayRiderReachedAt}
                orderStage={stage}
              />
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Delivery & payment</Text>
              <DetailRow label="Payment" value={paymentLabel(order.payment_method)} />
              {order.drop_address ? (
                <View style={styles.addressRow}>
                  <Ionicons name="location-outline" size={16} color="#666" />
                  <Text style={styles.addressText}>{order.drop_address}</Text>
                </View>
              ) : null}
              <OrderDetailOtpRow
                orderStatus={order.order_status}
                pickupOtp={order.pickup_otp}
                rtoOtp={order.rto_otp}
              />
            </View>

            <View style={styles.timelineSection}>
              <Text style={styles.timelineSectionTitle}>Order timeline</Text>
              <MerchantOrderVerticalTimeline
                order={apiFoodOrderToTimelineOrder(order)}
                timelineEntries={timelineEntries}
                actions={actions}
                riderReachedAt={displayRiderReachedAt}
              />
            </View>

            <View style={styles.actions}>
              {showAccept ? (
                <ActionButton
                  label="Accept order"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => void runAction("ACCEPTED")}
                />
              ) : null}
              {showMarkReady ? (
                <ActionButton
                  label="Mark ready"
                  variant="primary"
                  loading={actionLoading}
                  onPress={async () => {
                    if (
                      !token ||
                      !storeId ||
                      ordersFoodId == null ||
                      actionLoading ||
                      markReadyInFlightRef.current
                    ) {
                      return;
                    }
                    const st = order.order_status.toUpperCase();
                    if (st === "READY_FOR_PICKUP" || st === "OUT_FOR_DELIVERY" || st === "DELIVERED") {
                      return;
                    }
                    markReadyInFlightRef.current = true;
                    setActionLoading(true);
                    try {
                      if (st === "ACCEPTED") {
                        await patchFoodOrderStatus(storeId, ordersFoodId, token, "PREPARING", undefined, {
                          action_source: "app",
                        });
                      }
                      const updated = await patchFoodOrderStatus(
                        storeId,
                        ordersFoodId,
                        token,
                        "READY_FOR_PICKUP",
                        undefined,
                        { action_source: "app" }
                      );
                      setOrder(updated);
                      await refreshTimeline();
                      setError(null);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : "Update failed";
                      if (/invalid transition.*READY_FOR_PICKUP:READY_FOR_PICKUP/i.test(msg)) {
                        await load();
                        setError(null);
                        return;
                      }
                      setError(msg);
                    } finally {
                      markReadyInFlightRef.current = false;
                      setActionLoading(false);
                    }
                  }}
                />
              ) : null}
              {showDispatch ? (
                <ActionButton
                  label="Mark dispatched"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => void runAction("OUT_FOR_DELIVERY")}
                />
              ) : null}
              {showComplete ? (
                <ActionButton
                  label="Mark delivered"
                  variant="primary"
                  loading={actionLoading}
                  onPress={() => void runAction("DELIVERED")}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
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
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  backBtn: { padding: 8, marginRight: 8 },
  kotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  kotBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 0 },
  infoCard: {
    marginBottom: 14,
    marginHorizontal: H_PADDING,
    marginTop: 14,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  addressText: {
    flex: 1,
    fontSize: FONT_LABEL,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  card: {
    marginBottom: 14,
    marginHorizontal: H_PADDING,
    marginTop: 14,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 12,
  },
  detailLabel: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
    flexShrink: 0,
  },
  detailValue: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  detailMuted: { color: GatiMitraMerchant.textTertiary, fontWeight: "500" },
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
    marginTop: 14,
    marginBottom: 14,
  },
  timelineSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
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
