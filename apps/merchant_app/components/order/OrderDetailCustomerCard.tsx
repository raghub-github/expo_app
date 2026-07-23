/**
 * Order details — top status card (light mode, reference layout).
 */

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { ApiFoodOrder } from "@/services/ordersApi";
import type { OrderStage } from "@/hooks/useOrders";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  formatOrderDateTime,
  formatOrderIdDisplay,
  splitRejectionMessage,
} from "@/components/order/orderFormatters";
import { OrderCardMerchantInstructions } from "@/components/order/OrderCardMerchantInstructions";
import { OrderCancellationBanner } from "@/components/order/OrderCancellationBanner";
import { GatiMitraMerchant } from "@/constants/theme";

type StatusStyle = { label: string; bg: string; color: string };

type Props = {
  order: ApiFoodOrder;
  stage: OrderStage;
  statusStyle: StatusStyle;
  storeName?: string | null;
  prepBanner?: ReactNode;
};

export function OrderDetailCustomerCard({
  order,
  stage,
  statusStyle,
  storeName,
  prepBanner,
}: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [copied, setCopied] = useState(false);
  const isClosed = stage === "rejected" || stage === "rto";
  const placedLabel = formatOrderDateTime(
    isClosed && order.cancelled_at ? order.cancelled_at : order.created_at
  );

  const idDisplay = useMemo(
    () =>
      formatOrderIdDisplay(order.formatted_order_id, order.orders_core_id).replace(/^#?/i, ""),
    [order.formatted_order_id, order.orders_core_id]
  );

  const storeLine = [storeName?.trim() || selectedStore?.store_name?.trim()]
    .filter(Boolean)
    .join("");

  const rejection =
    isClosed
      ? splitRejectionMessage(
          order.rejected_reason,
          stage === "rto" ? "rto" : "rejected",
          order.cancelled_by_label,
          order.cancelled_by_type
        )
      : null;

  const onCopyId = async () => {
    if (!idDisplay) return;
    await Clipboard.setStringAsync(idDisplay);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.card}>
      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
        <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>
          {statusStyle.label.toUpperCase()}
        </Text>
      </View>

      <View style={styles.idRow}>
        <Pressable
          onPress={() => void onCopyId()}
          style={({ pressed }) => [styles.idPress, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Copy order ID"
        >
          <Text style={styles.idText} numberOfLines={1}>
            ID: {idDisplay || "—"}
          </Text>
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={16}
            color={copied ? "#16A34A" : GatiMitraMerchant.textSecondary}
          />
        </Pressable>
        <Text style={styles.timeText}>{placedLabel}</Text>
      </View>

      {storeLine ? (
        <Text style={styles.storeLine} numberOfLines={2}>
          {storeLine}
        </Text>
      ) : null}

      {rejection && (rejection.prefix || rejection.detail) ? (
        <Text style={styles.rejectLine}>
          {rejection.prefix}
          {rejection.detail ? (
            <Text style={styles.rejectDetail}> {rejection.detail}</Text>
          ) : null}
        </Text>
      ) : null}

      <OrderCardMerchantInstructions
        merchantInstructionsList={order.merchant_instructions_list}
        requiresUtensils={order.requires_utensils}
      />

      {isClosed && order.cancellation_compensation ? (
        <View style={styles.cancelMargin}>
          <OrderCancellationBanner
            rejectedReason={order.rejected_reason}
            cancelledByLabel={order.cancelled_by_label}
            cancelledByType={order.cancelled_by_type}
            cancelledAt={order.cancelled_at}
            orderStatus={order.order_status}
            cancellationCompensation={order.cancellation_compensation}
            storeId={selectedStore?.id}
            authToken={token}
            variant="detail"
            preparedAt={order.prepared_at}
            prepReadyByAt={order.prep_ready_by_at}
            preparedLateMinutes={order.prepared_late_minutes}
          />
        </View>
      ) : null}

      {prepBanner ? <View style={styles.prepWrap}>{prepBanner}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    ...GatiMitraMerchant.shadowSm,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  idPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  idText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    flexShrink: 0,
  },
  storeLine: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  rejectLine: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#B91C1C",
    lineHeight: 18,
  },
  rejectDetail: {
    fontWeight: "700",
    color: "#991B1B",
  },
  cancelMargin: { marginTop: 12 },
  prepWrap: { marginTop: 12 },
});
