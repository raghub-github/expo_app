import type { ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { ApiFoodOrder } from "@/services/ordersApi";
import type { OrderStage } from "@/hooks/useOrders";
import {
  formatOrderCardCustomerLabel,
  formatOrderDateTime,
} from "@/components/order/orderFormatters";
import { MerchantOrderIdRow } from "@/components/order/MerchantOrderCardToolbar";
import { OrderCardMerchantInstructions } from "@/components/order/OrderCardMerchantInstructions";
import { callCustomer } from "@/lib/orderCardActions";
import {
  GatiMitraMerchant,
  CARD_RADIUS,
  FONT_SECONDARY,
} from "@/constants/theme";
import { OrderCancellationBanner } from "@/components/order/OrderCancellationBanner";

type StatusStyle = { label: string; bg: string; color: string };

function deliveryTypeLabel(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "GATIMITRA_RIDER") return "GatiMitra delivery";
  if (t === "SELF_DELIVERY") return "Self delivery";
  if (t === "SELF_PICKUP") return "Self pickup";
  return "Delivery";
}

function deliveryIcon(type: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const t = String(type || "").toUpperCase();
  if (t === "SELF_PICKUP") return "bag-handle-outline";
  return "bicycle-outline";
}

type Props = {
  order: ApiFoodOrder;
  stage: OrderStage;
  statusStyle: StatusStyle;
  prepBanner?: ReactNode;
};

export function OrderDetailCustomerCard({
  order,
  stage,
  statusStyle,
  prepBanner,
}: Props) {
  const customerLabel = formatOrderCardCustomerLabel(
    order.customer_name,
    order.customer_store_order_ordinal
  );
  const isClosed = stage === "rejected" || stage === "rto";
  const placedLabel = formatOrderDateTime(order.created_at);
  const phone = (order.customer_phone ?? "").trim();

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["#EEF2FF", "#F8FAFC", "#FFFFFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      >
        <View style={styles.topRow}>
          <View style={styles.idWrap}>
            <MerchantOrderIdRow
              formattedOrderId={order.formatted_order_id}
              fallbackOrderId={order.orders_core_id}
            />
          </View>
          {!isClosed ? (
            <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusPillText, { color: statusStyle.color }]}>
                {statusStyle.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.deliveryChip}>
            <Ionicons name={deliveryIcon(order.delivery_type)} size={13} color="#4338CA" />
            <Text style={styles.deliveryChipText}>{deliveryTypeLabel(order.delivery_type)}</Text>
          </View>
          <View style={styles.placedChip}>
            <Ionicons name="time-outline" size={12} color="#64748B" />
            <Text style={styles.placedChipText}>{placedLabel}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.customerRow}>
        <View style={styles.customerLeft}>
          <View style={styles.avatarRing}>
            <LinearGradient
              colors={["#6366F1", "#818CF8"]}
              style={styles.avatar}
            >
              <Ionicons name="person" size={22} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.customerBody}>
            <Text style={styles.customerLabel} numberOfLines={2}>
              {customerLabel}
            </Text>
            {phone ? (
              <Text style={styles.phoneStatic} numberOfLines={1}>
                {phone}
              </Text>
            ) : null}
          </View>
        </View>

        {phone ? (
          <Pressable
            onPress={() => void callCustomer(order.customer_phone)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            accessibilityLabel="Call customer"
          >
            <LinearGradient
              colors={["#2563EB", "#1D4ED8"]}
              style={styles.callBtnInner}
            >
              <Ionicons name="call" size={20} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.callHint}>Call</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.bodyPad}>
        <OrderCardMerchantInstructions
          merchantInstructionsList={order.merchant_instructions_list}
          requiresUtensils={order.requires_utensils}
        />

        {isClosed ? (
          <View style={styles.cancelMargin}>
            <OrderCancellationBanner
              rejectedReason={order.rejected_reason}
              cancelledByLabel={order.cancelled_by_label}
              cancelledByType={order.cancelled_by_type}
              cancelledAt={order.cancelled_at}
              orderStatus={order.order_status}
            />
          </View>
        ) : null}

        {prepBanner ? <View style={styles.prepWrap}>{prepBanner}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
  },
  heroGradient: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  idWrap: { flex: 1, minWidth: 0 },
  statusPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 2,
  },
  statusPillText: { fontSize: 12, fontWeight: "700" },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  deliveryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  deliveryChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4338CA",
  },
  placedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  placedChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  customerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatarRing: {
    padding: 2,
    borderRadius: 26,
    backgroundColor: "#E0E7FF",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  customerBody: { flex: 1, minWidth: 0, gap: 3 },
  customerLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  phoneStatic: {
    fontSize: FONT_SECONDARY,
    fontWeight: "600",
    color: "#64748B",
  },
  callBtn: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  callBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  callHint: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: 0.2,
  },
  bodyPad: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  cancelMargin: { marginTop: 12 },
  prepWrap: { marginTop: 12 },
  pressed: { opacity: 0.85 },
});
