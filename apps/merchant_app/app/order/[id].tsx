/**
 * Order detail screen — full order info, timeline, actions (Accept / Prepare / Complete).
 * Opened when partner taps a recent order card.
 */

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fetchOrderEta, minutesUntil, prepDeadlineIso, type OrderEtaResponse } from "@/services/etaApi";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  CARD_PADDING,
  FONT_LABEL,
  FONT_SECONDARY,
} from "@/constants/theme";

type OrderStatus = "Pending" | "Preparing" | "Completed";

interface OrderItem {
  name: string;
  qty: number;
  price: string;
}

interface TimelineStep {
  label: string;
  time: string;
  done: boolean;
}

interface OrderDetail {
  id: string;
  customerName: string;
  items: OrderItem[];
  total: string;
  paymentMethod: string;
  status: OrderStatus;
  timeline: TimelineStep[];
  rider?: { name: string; phone: string };
  placedAt: string;
}

function getOrderDetail(id: string): OrderDetail | null {
  const mock: Record<string, OrderDetail> = {
    "GM-2851": {
      id: "GM-2851",
      customerName: "Rahul S.",
      items: [
        { name: "Burger", qty: 2, price: "₹120" },
        { name: "Fries", qty: 1, price: "₹109" },
      ],
      total: "₹349",
      paymentMethod: "Online (UPI)",
      status: "Preparing",
      placedAt: "5 min ago",
      timeline: [
        { label: "Order placed", time: "11:52", done: true },
        { label: "Accepted", time: "11:53", done: true },
        { label: "Preparing", time: "—", done: true },
        { label: "Completed", time: "—", done: false },
      ],
    },
    "GM-2850": {
      id: "GM-2850",
      customerName: "Priya M.",
      items: [{ name: "Margherita Pizza", qty: 1, price: "₹499" }],
      total: "₹499",
      paymentMethod: "Cash on delivery",
      status: "Pending",
      placedAt: "12 min ago",
      timeline: [
        { label: "Order placed", time: "11:45", done: true },
        { label: "Accepted", time: "—", done: false },
        { label: "Preparing", time: "—", done: false },
        { label: "Completed", time: "—", done: false },
      ],
    },
    "GM-2849": {
      id: "GM-2849",
      customerName: "Vikram K.",
      items: [
        { name: "Biryani", qty: 3, price: "₹180" },
        { name: "Raita", qty: 2, price: "₹90" },
      ],
      total: "₹720",
      paymentMethod: "Online (Card)",
      status: "Completed",
      placedAt: "28 min ago",
      timeline: [
        { label: "Order placed", time: "11:20", done: true },
        { label: "Accepted", time: "11:22", done: true },
        { label: "Preparing", time: "11:25", done: true },
        { label: "Completed", time: "11:35", done: true },
      ],
      rider: { name: "Amit (Rider)", phone: "+91 98*** ****" },
    },
    "GM-2848": {
      id: "GM-2848",
      customerName: "Anita R.",
      items: [
        { name: "Cold Coffee", qty: 1, price: "₹145" },
        { name: "Sandwich", qty: 2, price: "₹120" },
      ],
      total: "₹385",
      paymentMethod: "Online (UPI)",
      status: "Completed",
      placedAt: "1 hr ago",
      timeline: [
        { label: "Order placed", time: "10:48", done: true },
        { label: "Accepted", time: "10:50", done: true },
        { label: "Preparing", time: "10:52", done: true },
        { label: "Completed", time: "11:00", done: true },
      ],
    },
    "GM-2847": {
      id: "GM-2847",
      customerName: "Suresh P.",
      items: [
        { name: "Samosa", qty: 4, price: "₹40" },
        { name: "Chai", qty: 2, price: "₹30" },
      ],
      total: "₹220",
      paymentMethod: "Cash on delivery",
      status: "Completed",
      placedAt: "1 hr 15 min ago",
      timeline: [
        { label: "Order placed", time: "10:33", done: true },
        { label: "Accepted", time: "10:35", done: true },
        { label: "Preparing", time: "10:37", done: true },
        { label: "Completed", time: "10:45", done: true },
      ],
    },
  };
  return mock[id] ?? null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        isPrimary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
        pressed && styles.actionBtnPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <Text style={[styles.actionBtnText, isPrimary && styles.actionBtnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const orderId = id ?? "";
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const fullOrder = getOrderDetail(orderId);
  const effectiveStatus = (status ?? fullOrder?.status ?? "Pending") as OrderStatus;

  // Pull the platform's frozen promise + live snapshot for this order. We
  // only call the API when the id looks like a real GM-* order id (mock data
  // uses ids like "GM-2851" which won't resolve, so we short-circuit instead
  // of spamming 404s in the console).
  const [eta, setEta] = useState<OrderEtaResponse | null>(null);
  useEffect(() => {
    let alive = true;
    if (!orderId || !/^GM\d+$/i.test(orderId)) return;
    void fetchOrderEta(orderId).then((r) => {
      if (alive) setEta(r);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);
  const prepByIso = prepDeadlineIso(eta);
  const prepMinsLeft = minutesUntil(prepByIso);

  if (!orderId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, GatiMitraMerchant.cursorPointer]}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <Text style={styles.empty}>Order not found.</Text>
      </View>
    );
  }

  const showAccept = effectiveStatus === "Pending";
  const showComplete = effectiveStatus === "Preparing";

  const statusStyle = {
    Pending: { bg: GatiMitraMerchant.statusPendingBg, color: GatiMitraMerchant.statusPending },
    Preparing: { bg: GatiMitraMerchant.statusPreparingBg, color: GatiMitraMerchant.statusPreparing },
    Completed: { bg: GatiMitraMerchant.statusCompletedBg, color: GatiMitraMerchant.statusCompleted },
  }[effectiveStatus];

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
        {fullOrder ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Order #{fullOrder.id}</Text>
              <DetailRow label="Customer" value={fullOrder.customerName} />
              <DetailRow label="Placed" value={fullOrder.placedAt} />
              <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusPillText, { color: statusStyle.color }]}>{effectiveStatus}</Text>
              </View>

              {/* Prep deadline — derived from the platform's promise time.
                  Counts down so the merchant can pace the kitchen. */}
              {prepByIso ? (
                <View
                  style={{
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
                  }}
                >
                  <Ionicons name="alarm" size={18} color="#c2410c" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#c2410c" }}>
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
                      <Text style={{ fontSize: 11, color: "#9a3412", marginTop: 2 }}>
                        Customer was promised delivery by{" "}
                        {new Date(eta.promise.promisedDeliveryAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Items</Text>
              {fullOrder.items.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {item.qty}× {item.name}
                  </Text>
                  <Text style={styles.itemPrice}>{item.price}</Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>{fullOrder.total}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <DetailRow label="Payment" value={fullOrder.paymentMethod} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Status timeline</Text>
              {fullOrder.timeline.map((step, i) => (
                <View key={i} style={styles.timelineRow}>
                  <View style={[styles.timelineDot, step.done && styles.timelineDotDone]} />
                  <Text style={[styles.timelineLabel, step.done && styles.timelineLabelDone]}>{step.label}</Text>
                  <Text style={styles.timelineTime}>{step.time}</Text>
                </View>
              ))}
            </View>

            {fullOrder.rider && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Delivery</Text>
                <DetailRow label="Rider" value={fullOrder.rider.name} />
                <DetailRow label="Contact" value={fullOrder.rider.phone} />
              </View>
            )}

            <View style={styles.actions}>
              {showAccept && (
                <ActionButton label="Accept order" variant="primary" onPress={() => setStatus("Preparing")} />
              )}
              {showComplete && (
                <ActionButton label="Mark complete" variant="primary" onPress={() => setStatus("Completed")} />
              )}
              {effectiveStatus === "Completed" && (
                <Text style={styles.completedHint}>This order is completed.</Text>
              )}
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.value}>Order {orderId}</Text>
            <Text style={styles.hint}>Full details will load from API.</Text>
          </View>
        )}
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
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
  },
  card: {
    marginBottom: 14,
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
    alignItems: "center",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
  },
  detailValue: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemName: {
    fontSize: FONT_LABEL,
    color: GatiMitraMerchant.textPrimary,
  },
  itemPrice: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.divider,
  },
  totalLabel: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginRight: 12,
  },
  timelineDotDone: {
    backgroundColor: GatiMitraMerchant.storeOnline,
  },
  timelineLabel: {
    flex: 1,
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
  },
  timelineLabelDone: {
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "500",
  },
  timelineTime: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textTertiary,
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  actionBtnPrimary: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  actionBtnSecondary: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  actionBtnPressed: {
    opacity: 0.9,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  actionBtnTextPrimary: {
    color: "#FFFFFF",
  },
  completedHint: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  empty: {
    padding: H_PADDING,
    fontSize: FONT_LABEL,
    color: GatiMitraMerchant.textSecondary,
  },
  value: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  hint: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textTertiary,
  },
});
