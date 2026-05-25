import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { MarkAsReadyCountdownButton } from "@/components/order/MarkAsReadyCountdownButton";
import {
  PLATFORM_DEFAULT_PREP_MINUTES,
  type PrepCountdownOrder,
} from "@/lib/order-prep-time";
import { sliceOrderLineItems } from "@/lib/orderCardDisplay";
import { formatCustomerPossessiveOrderLabel } from "@/components/order/orderFormatters";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";

export function orderToPrepCountdown(order: OrderRecord): PrepCountdownOrder {
  return {
    created_at: order.createdAt,
    accepted_at: order.acceptedAt ?? null,
    preparing_at: order.preparingAt ?? null,
    preparation_time_minutes:
      order.preparationTimeMinutes ?? PLATFORM_DEFAULT_PREP_MINUTES,
    prep_ready_by_at: order.prepReadyByAt ?? null,
  };
}

function vegBadge(veg?: string | null): string | null {
  if (veg === "veg") return "VEG ONLY";
  if (veg === "non_veg") return "NON VEG ONLY";
  if (veg === "mixed") return "MIXED";
  return null;
}

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  nowMs: number;
  onReady: () => void;
  onViewDetail: () => void;
  onItemPress?: (item: LineItem) => void;
  loading?: boolean;
};

export function MerchantPreparingOrderCard({
  order,
  storeName,
  nowMs,
  onReady,
  onViewDetail,
  onItemPress,
  loading,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const badge = vegBadge(order.vegNonVeg);
  const prepOrder = useMemo(() => orderToPrepCountdown(order), [order]);
  const itemCount = order.lineItems.reduce((s, it) => s + it.qty, 0);
  const { visible: visibleItems, moreCount } = sliceOrderLineItems(order.lineItems);
  const customerLabel = formatCustomerPossessiveOrderLabel(
    order.customerName,
    order.customerStoreOrderOrdinal
  );

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          {badge ? (
            <View style={styles.vegBadge}>
              <Ionicons name="leaf" size={11} color="#2E7D32" />
              <Text style={styles.vegBadgeText}>{badge}</Text>
            </View>
          ) : null}
          <Text style={styles.orderId}>
            {order.formattedOrderId ?? order.orderNumber}
          </Text>
          {storeName ? (
            <Text style={styles.storeName} numberOfLines={1}>
              {storeName}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={onViewDetail} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={18} color={GatiMitraMerchant.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.customerRow}>
        <Text style={styles.customerName} numberOfLines={2}>
          {customerLabel}
        </Text>
        <Text style={styles.time}>{order.displayTime}</Text>
      </View>

      <Pressable
        onPress={() => setDetailsOpen((v) => !v)}
        style={styles.detailsToggle}
      >
        <Text style={styles.detailsLabel}>
          Details · {itemCount} item{itemCount === 1 ? "" : "s"}
        </Text>
        <Ionicons
          name={detailsOpen ? "chevron-up" : "chevron-down"}
          size={16}
          color={GatiMitraMerchant.textSecondary}
        />
      </Pressable>

      {detailsOpen ? (
        <View style={styles.itemsBox}>
          {visibleItems.map((item, idx) => (
            <OrderCardItemRow
              key={`${order.id}-${idx}`}
              item={item}
              orderVeg={order.vegNonVeg}
              onItemNamePress={() => onItemPress?.(item)}
              onRowPress={onViewDetail}
            />
          ))}
          {moreCount > 0 ? (
            <Pressable onPress={onViewDetail}>
              <Text style={styles.moreItems}>+{moreCount} more</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total bill</Text>
        <Text style={styles.totalValue}>₹ {order.total.toLocaleString("en-IN")}</Text>
      </View>

      <View style={styles.riderRow}>
        <Ionicons name="bicycle-outline" size={16} color="#666" />
        <Text style={styles.riderText}>Assigning delivery partner…</Text>
      </View>

      <MarkAsReadyCountdownButton
        order={prepOrder}
        nowMs={nowMs}
        onPress={onReady}
        disabled={loading}
        labelPrefix="Order Ready"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    padding: 16,
    gap: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  topLeft: { flex: 1, minWidth: 0, gap: 6 },
  vegBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  vegBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2E7D32",
    letterSpacing: 0.4,
  },
  orderId: { fontSize: 16, fontWeight: "800", color: "#1A1A1A" },
  storeName: { fontSize: 12, fontWeight: "500", color: "#666666" },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
    paddingBottom: 10,
  },
  customerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    minWidth: 0,
  },
  time: { fontSize: 12, color: "#666666" },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailsLabel: { fontSize: 13, fontWeight: "600", color: "#444444" },
  itemsBox: { gap: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemText: { flex: 1, fontSize: 13, color: "#1A1A1A" },
  moreItems: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 13, color: "#666666" },
  totalValue: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  riderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  riderText: { fontSize: 12, fontWeight: "500", color: "#666666" },
  pressed: { opacity: 0.85 },
});
