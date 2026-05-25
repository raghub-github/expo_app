import type { ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApiFoodOrder } from "@/services/ordersApi";
import type { OrderStage } from "@/hooks/useOrders";
import {
  formatCustomerOrderOrdinalWithYou,
  formatOrderDateTime,
} from "@/components/order/orderFormatters";
import { callCustomer } from "@/lib/orderCardActions";
import {
  GatiMitraMerchant,
  CARD_RADIUS,
  CARD_PADDING,
  FONT_LABEL,
  FONT_SECONDARY,
} from "@/constants/theme";
import { OrderCancellationBanner } from "@/components/order/OrderCancellationBanner";

type StatusStyle = { label: string; bg: string; color: string };

type Props = {
  order: ApiFoodOrder;
  displayId: string;
  stage: OrderStage;
  statusStyle: StatusStyle;
  prepBanner?: ReactNode;
};

export function OrderDetailCustomerCard({
  order,
  displayId,
  stage,
  statusStyle,
  prepBanner,
}: Props) {
  const customerName = order.customer_name?.trim() || "Guest";
  const ordinal = formatCustomerOrderOrdinalWithYou(order.customer_store_order_ordinal);
  const isClosed = stage === "rejected" || stage === "rto";

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.orderId}>Order #{displayId}</Text>
        {!isClosed ? (
          <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusPillText, { color: statusStyle.color }]}>
              {statusStyle.label}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.customerHero}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color="#2563EB" />
        </View>
        <View style={styles.customerBody}>
          <Text style={styles.customerName}>{customerName}</Text>
          {ordinal ? <Text style={styles.ordinal}>{ordinal}</Text> : null}
          {order.customer_phone ? (
            <Pressable
              onPress={() => void callCustomer(order.customer_phone)}
              style={({ pressed }) => [styles.phoneRow, pressed && styles.pressed]}
            >
              <Ionicons name="call-outline" size={14} color="#2563EB" />
              <Text style={styles.phone}>{order.customer_phone}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.placed}>
            Placed · {formatOrderDateTime(order.created_at)}
          </Text>
        </View>
      </View>

      {isClosed ? (
        <OrderCancellationBanner
          rejectedReason={order.rejected_reason}
          cancelledByLabel={order.cancelled_by_label}
          cancelledByType={order.cancelled_by_type}
          cancelledAt={order.cancelled_at}
          orderStatus={order.order_status}
        />
      ) : null}

      {prepBanner ? <View style={styles.prepWrap}>{prepBanner}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  orderId: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  statusPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  customerHero: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  customerBody: { flex: 1, minWidth: 0, gap: 4 },
  customerName: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  ordinal: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  phone: {
    fontSize: FONT_SECONDARY,
    fontWeight: "600",
    color: "#2563EB",
  },
  placed: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  prepWrap: { marginTop: 12 },
  pressed: { opacity: 0.85 },
});
