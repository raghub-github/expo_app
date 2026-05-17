/**
 * Order detail — polished Partner-style layout.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  CARD_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  apiStatusToStage,
  stageTransitionToApi,
  type OrderStage,
} from "@/hooks/useOrders";
import {
  fetchFoodOrder,
  patchFoodOrderStatus,
  type ApiFoodOrder,
} from "@/services/ordersApi";
import {
  formatOrderDateTime,
  formatOrderIdDisplay,
  splitRejectionMessage,
} from "@/components/order/orderFormatters";
import { CustomerStoreOrdinalPill } from "@/components/order/CustomerStoreOrdinalPill";
import { ItemVegMark } from "@/components/order/ItemVegMark";

const DETAIL_SECTION_GAP = 12;

const REJECTED_BG = "#DC2626";
const REJECTED_BORDER = "#B91C1C";

function formatPayment(method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("upi")) return "Online (UPI)";
  if (m.includes("card")) return "Online (Card)";
  if (m.includes("cod") || m.includes("cash")) return "Cash on delivery";
  return method;
}

function statusColors(stage: OrderStage) {
  if (stage === "rejected") return { bg: "#DC2626", border: "#B91C1C", text: "#FFF" };
  if (stage === "rto") return { bg: "#EA580C", border: "#C2410C", text: "#FFF" };
  if (stage === "delivered") return { bg: "#16A34A", border: "#15803D", text: "#FFF" };
  if (stage === "ready") return { bg: "#0D9488", border: "#0F766E", text: "#FFF" };
  if (stage === "preparing") return { bg: "#16A34A", border: "#15803D", text: "#FFF" };
  if (stage === "picked_up") return { bg: "#2563EB", border: "#1D4ED8", text: "#FFF" };
  return { bg: "#22C55E", border: "#16A34A", text: "#FFF" };
}

function SectionHeader({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={18} color={GatiMitraMerchant.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon} size={16} color={GatiMitraMerchant.primary} />
      <View style={styles.infoChipText}>
        <Text style={styles.infoChipLabel}>{label}</Text>
        <Text style={styles.infoChipValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function TimelineStepRow({
  label,
  time,
  state,
  isLast,
}: {
  label: string;
  time: string;
  state: "done" | "rejected" | "pending";
  isLast: boolean;
}) {
  const dotStyle =
    state === "rejected"
      ? styles.timelineDotRejected
      : state === "done"
        ? styles.timelineDotDone
        : styles.timelineDotPending;

  return (
    <View style={styles.timelineStep}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, dotStyle]}>
          {state === "done" && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
          {state === "rejected" && <Ionicons name="close" size={12} color="#FFFFFF" />}
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>
      <View style={styles.timelineContent}>
        <Text style={[styles.timelineLabel, state !== "pending" && styles.timelineLabelActive]}>
          {label}
        </Text>
        {time !== "—" ? <Text style={styles.timelineTime}>{time}</Text> : null}
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const ordersFoodId = parseInt(id ?? "", 10);

  const [order, setOrder] = useState<ApiFoodOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !storeId || !Number.isFinite(ordersFoodId)) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await fetchFoodOrder(storeId, ordersFoodId, token);
      setOrder(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [token, storeId, ordersFoodId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stage = order ? apiStatusToStage(order.order_status) : "created";
  const displayId = order
    ? formatOrderIdDisplay(
        order.formatted_order_id,
        order.orders_core_id,
        order.orders_food_id
      )
    : id ?? "";

  const isRejected = stage === "rejected" || stage === "rto";
  const headerDateIso =
    order && isRejected && order.cancelled_at
      ? order.cancelled_at
      : order?.created_at ?? "";
  const placedLabel = headerDateIso ? formatOrderDateTime(headerDateIso) : "";
  const isDelivered = stage === "delivered";
  const statusStyle = statusColors(stage);

  const customerName = order?.customer_name?.trim() || "Guest";

  const timeline = useMemo(() => {
    if (!order) return [];
    const steps: Array<{
      label: string;
      time: string;
      state: "done" | "rejected" | "pending";
    }> = [
      {
        label: "Order placed",
        time: formatOrderDateTime(order.created_at),
        state: "done",
      },
    ];
    if (order.accepted_at) {
      steps.push({
        label: "Accepted",
        time: formatOrderDateTime(order.accepted_at),
        state: "done",
      });
    }
    if (order.prepared_at || order.dispatched_at) {
      steps.push({
        label: "Preparing / Ready",
        time: formatOrderDateTime(order.prepared_at ?? order.dispatched_at),
        state: "done",
      });
    }
    if (stage === "rejected") {
      steps.push({
        label: "Rejected by restaurant",
        time: order.cancelled_at ? formatOrderDateTime(order.cancelled_at) : "—",
        state: "rejected",
      });
    } else if (stage === "rto") {
      steps.push({
        label: "Return to origin",
        time: order.cancelled_at ? formatOrderDateTime(order.cancelled_at) : "—",
        state: "rejected",
      });
    } else if (isDelivered) {
      steps.push({
        label: "Delivered",
        time: formatOrderDateTime(order.delivered_at),
        state: "done",
      });
    }
    return steps;
  }, [order, stage, isDelivered]);

  const applyTransition = async (nextStage: OrderStage) => {
    if (!token || !storeId || !order || !Number.isFinite(ordersFoodId)) return;
    const apiStatus = stageTransitionToApi(stage, nextStage);
    setUpdating(true);
    try {
      const updated = await patchFoodOrderStatus(storeId, ordersFoodId, token, apiStatus);
      setOrder(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  };

  const showAccept = stage === "created";
  const showMarkReady = stage === "preparing";
  const showDispatch = stage === "ready" && order?.delivery_type !== "GATIMITRA_RIDER";
  const showDeliver = stage === "picked_up" && order?.delivery_type !== "GATIMITRA_RIDER";

  const itemSubtotal = (order?.items ?? []).reduce((s, it) => s + it.price * it.qty, 0);
  const total = Number(order?.grand_total) || itemSubtotal;

  const rejection = order && isRejected
    ? splitRejectionMessage(order.rejected_reason, stage === "rto" ? "rto" : "rejected")
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Order details</Text>
          <Text style={styles.headerOrderId} numberOfLines={1}>
            {displayId}
          </Text>
          {selectedStore?.store_name ? (
            <Text style={styles.headerStoreName} numberOfLines={2}>
              {selectedStore.store_name}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={GatiMitraMerchant.primary}
            style={{ marginTop: 48 }}
          />
        ) : error && !order ? (
          <Card>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : order ? (
          <>
            <Card style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                    {stage === "rto" ? "RTO" : stage.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.heroDate}>{placedLabel}</Text>
              </View>

              <Text style={styles.heroOrderId}>#{displayId}</Text>

              <View style={styles.heroCustomerBlock}>
                <Text style={styles.heroCustomerName} numberOfLines={2}>
                  {customerName}
                </Text>
                {order.customer_phone ? (
                  <Text style={styles.heroPhone}>{order.customer_phone}</Text>
                ) : null}
                {order.drop_address ? (
                  <View style={styles.heroAddressRow}>
                    <Ionicons
                      name="location-outline"
                      size={15}
                      color={GatiMitraMerchant.textTertiary}
                      style={styles.heroAddressIcon}
                    />
                    <Text style={styles.heroAddress} numberOfLines={3}>
                      {order.drop_address}
                    </Text>
                  </View>
                ) : null}
                {order.distance_km != null && order.distance_km > 0 ? (
                  <Text style={styles.heroDistance}>
                    {order.distance_km.toFixed(1)} km from store
                  </Text>
                ) : null}
                <CustomerStoreOrdinalPill
                  ordinal={order.customer_store_order_ordinal}
                  variant="banner"
                />
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroTotalRow}>
                <Text style={styles.heroTotalLabel}>Order total</Text>
                <Text style={styles.heroTotalAmount}>₹{total.toLocaleString("en-IN")}</Text>
              </View>

              {rejection ? (
                <View style={styles.rejectionBox}>
                  <Text style={styles.rejectionLine}>
                    <Text style={styles.rejectionPrefix}>{rejection.prefix} </Text>
                    <Text style={styles.rejectionDetail}>{rejection.detail}</Text>
                  </Text>
                </View>
              ) : null}
            </Card>

            <View style={styles.chipRow}>
              <InfoChip
                icon="bicycle-outline"
                label="Delivery"
                value={String(order.delivery_type).replace(/_/g, " ")}
              />
              <InfoChip
                icon="card-outline"
                label="Payment"
                value={formatPayment(order.payment_method)}
              />
            </View>

            <SectionHeader icon="restaurant-outline" title="Items" />
            <Card>
              {(order.items ?? []).map((item, i) => (
                <View
                  key={i}
                  style={[styles.itemRow, i === (order.items?.length ?? 0) - 1 && styles.itemRowLast]}
                >
                  <ItemVegMark vegNonveg={item.veg_nonveg} name={item.name} size={14} />
                  <Text style={styles.itemName}>
                    {item.qty} × {item.name}
                  </Text>
                  <Text style={styles.itemPrice}>₹{item.price.toLocaleString("en-IN")}</Text>
                </View>
              ))}
            </Card>

            <SectionHeader icon="receipt-outline" title="Bill" />
            <Card>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item subtotal</Text>
                <Text style={styles.billValue}>₹{itemSubtotal.toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Taxes & charges</Text>
                <Text style={styles.billValue}>₹0</Text>
              </View>
              <View style={styles.billDivider} />
              <View style={styles.billTotalRow}>
                <View style={styles.billTotalLeft}>
                  <Text style={styles.billTotalLabel}>Total paid</Text>
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>PAID</Text>
                  </View>
                </View>
                <Text style={styles.billTotalAmount}>₹{total.toLocaleString("en-IN")}</Text>
              </View>
            </Card>

            <SectionHeader icon="time-outline" title="Timeline" />
            <Card>
              {timeline.map((step, i) => (
                <TimelineStepRow
                  key={step.label}
                  label={step.label}
                  time={step.time}
                  state={step.state}
                  isLast={i === timeline.length - 1}
                />
              ))}
            </Card>

            {(showAccept || showMarkReady || showDispatch || showDeliver) && (
              <View style={styles.actions}>
                {showAccept && (
                  <Pressable
                    style={[styles.primaryBtn, updating && { opacity: 0.6 }]}
                    disabled={updating}
                    onPress={() => void applyTransition("preparing")}
                  >
                    <Text style={styles.primaryBtnText}>Accept order</Text>
                  </Pressable>
                )}
                {showMarkReady && (
                  <Pressable
                    style={[styles.primaryBtn, updating && { opacity: 0.6 }]}
                    disabled={updating}
                    onPress={() => void applyTransition("ready")}
                  >
                    <Text style={styles.primaryBtnText}>Mark ready for pickup</Text>
                  </Pressable>
                )}
                {showDispatch && (
                  <Pressable
                    style={[styles.primaryBtn, updating && { opacity: 0.6 }]}
                    disabled={updating}
                    onPress={() => void applyTransition("picked_up")}
                  >
                    <Text style={styles.primaryBtnText}>Out for delivery</Text>
                  </Pressable>
                )}
                {showDeliver && (
                  <Pressable
                    style={[styles.primaryBtn, updating && { opacity: 0.6 }]}
                    disabled={updating}
                    onPress={() => void applyTransition("delivered")}
                  >
                    <Text style={styles.primaryBtnText}>Mark delivered</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        ) : (
          <Card>
            <Text style={styles.errorText}>Order not found.</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTextWrap: { flex: 1 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  headerOrderId: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
    marginTop: 2,
  },
  headerStoreName: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 4,
    lineHeight: 19,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    marginTop: 2,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  card: {
    marginBottom: DETAIL_SECTION_GAP,
    padding: CARD_PADDING,
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  heroCard: {
    paddingBottom: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  heroDate: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  heroOrderId: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  heroCustomerBlock: {
    gap: 4,
  },
  heroCustomerName: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 22,
  },
  heroPhone: {
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  heroAddressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 6,
  },
  heroAddressIcon: {
    marginTop: 2,
  },
  heroAddress: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  heroDistance: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  heroDivider: {
    height: 1,
    backgroundColor: GatiMitraMerchant.border,
    marginVertical: 12,
  },
  heroTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroTotalLabel: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    fontWeight: "500",
  },
  heroTotalAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  rejectionBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  rejectionLine: { fontSize: 13, lineHeight: 19 },
  rejectionPrefix: { fontWeight: "700", color: REJECTED_BG },
  rejectionDetail: { color: GatiMitraMerchant.textSecondary },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: DETAIL_SECTION_GAP,
  },
  infoChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 12,
  },
  infoChipText: { flex: 1 },
  infoChipLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoChipValue: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  itemRowLast: { marginBottom: 0 },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  billLabel: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  billValue: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  billDivider: {
    height: 1,
    backgroundColor: GatiMitraMerchant.border,
    marginVertical: 10,
  },
  billTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  billTotalLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  billTotalLabel: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  paidBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  paidBadgeText: { fontSize: 10, fontWeight: "800", color: "#15803D" },
  billTotalAmount: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  timelineStep: { flexDirection: "row", minHeight: 48 },
  timelineRail: { alignItems: "center", width: 28 },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: { backgroundColor: GatiMitraMerchant.primary },
  timelineDotRejected: { backgroundColor: REJECTED_BG },
  timelineDotPending: { backgroundColor: GatiMitraMerchant.border },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginVertical: 4,
  },
  timelineContent: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
  timelineLabel: { fontSize: 14, color: GatiMitraMerchant.textTertiary },
  timelineLabelActive: { color: GatiMitraMerchant.textPrimary, fontWeight: "600" },
  timelineTime: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  actions: { gap: 10, marginBottom: 16 },
  primaryBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 15,
    borderRadius: CARD_RADIUS,
    alignItems: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  errorText: { fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
});
