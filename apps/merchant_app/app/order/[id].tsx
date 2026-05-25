/**
 * Order detail — loads from merchant-partner food-orders API.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  fetchFoodOrder,
  fetchFoodOrderTimeline,
  fetchFoodOrderActions,
  fetchFoodOrderRidersLog,
  patchFoodOrderStatus,
  type ApiFoodOrder,
  type FoodOrderTimelineEntry,
  type MerchantOrderActionForTimeline,
} from "@/services/ordersApi";
import { apiFoodOrderToTimelineOrder } from "@/lib/merchantVisibleTimeline";
import { MerchantOrderVerticalTimeline } from "@/components/order/MerchantOrderVerticalTimeline";
import { OrderItemDetails } from "@/components/order/OrderItemDetails";
import { OrderBillDetails } from "@/components/order/OrderBillDetails";
import { OrderDetailCustomerCard } from "@/components/order/OrderDetailCustomerCard";
import { fetchOrderEta, minutesUntil, prepDeadlineIso, type OrderEtaResponse } from "@/services/etaApi";
import { apiStatusToStage, type OrderStage } from "@/hooks/useOrders";
import { OrderDetailSkeleton } from "@/components/order/OrderDetailSkeleton";
import {
  formatOrderIdDisplay,
} from "@/components/order/orderFormatters";
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

  const routeId = id ?? "";
  const ordersFoodId = parseOrdersFoodId(routeId);
  const storeId = selectedStore?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<ApiFoodOrder | null>(null);
  const [timeline, setTimeline] = useState<FoodOrderTimelineEntry[]>([]);
  const [actions, setActions] = useState<MerchantOrderActionForTimeline[]>([]);
  const [riderReachedAt, setRiderReachedAt] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
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

  const displayId = order
    ? formatOrderIdDisplay(order.formatted_order_id, order.orders_core_id, order.orders_food_id)
    : routeId;

  const prepByIso = prepDeadlineIso(eta);
  const prepMinsLeft = minutesUntil(prepByIso);

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
        <Text style={styles.headerTitle}>Order details</Text>
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
                displayId={displayId}
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

            <View style={styles.card}>
              <DetailRow label="Payment" value={paymentLabel(order.payment_method)} />
              {order.drop_address ? (
                <DetailRow label="Address" value={order.drop_address} />
              ) : null}
              {order.pickup_otp ? <DetailRow label="Pickup OTP" value={order.pickup_otp} /> : null}
            </View>

            <View style={styles.timelineSection}>
              <Text style={styles.timelineSectionTitle}>Order timeline</Text>
              <MerchantOrderVerticalTimeline
                order={apiFoodOrderToTimelineOrder(order)}
                timelineEntries={timelineEntries}
                actions={actions}
                riderReachedAt={riderReachedAt}
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
                    if (!token || !storeId || ordersFoodId == null) return;
                    setActionLoading(true);
                    try {
                      const st = order.order_status.toUpperCase();
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
                      setError(e instanceof Error ? e.message : "Update failed");
                    } finally {
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
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 0 },
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
