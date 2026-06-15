/**
 * GatiMitra-style order cancellation bottom sheet with charge breakdown.
 */

import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { FoodCancelReasonSheet } from "@/components/orders/FoodCancelReasonSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { parseOrderBillFromSnapshot } from "@/lib/orderBillBreakdown";
import type { FoodCancelReason } from "@/lib/food-cancel-reasons";
import {
  isCustomerOrderOnTheWayStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

const MINT = GatiMitraColors.primaryMint;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const DESTRUCTIVE = GatiMitraColors.errorRed;

type FoodOrderCancelSheetProps = {
  visible: boolean;
  order: OrderDetail;
  onClose: () => void;
  onOpenHelp: () => void;
  onOpenChat: () => void;
  onCancelled?: () => void;
};

function formatMoney(value: number) {
  return `₹${value.toFixed(2)}`;
}

function resolveCancelBreakdown(order: OrderDetail) {
  const bill = parseOrderBillFromSnapshot(
    order.billingSnapshot,
    order.totalAmount ?? null,
    order.tipAmount ?? null
  );
  const orderAmount = bill.paid || bill.grandTotal || order.totalAmount || 0;
  const status = normalizeCustomerOrderStatus(order.status);
  const prepStarted =
    status === "PREPARING" ||
    status === "READY" ||
    status === "READY_FOR_PICKUP" ||
    isCustomerOrderOnTheWayStatus(status) ||
    status === "RIDER_ASSIGNED" ||
    status === "ASSIGNED" ||
    status === "REACHED_STORE";
  const chargePct = 100;
  const cancelCharge = orderAmount;
  const refund = 0;
  return { orderAmount, cancelCharge, chargePct, refund, prepStarted };
}

function resolveCancelTitle(prepStarted: boolean): string {
  return prepStarted ? "Food under preparation" : "Cancel this order?";
}

export function FoodOrderCancelSheet({
  visible,
  order,
  onClose,
  onOpenHelp,
  onOpenChat,
  onCancelled,
}: FoodOrderCancelSheetProps) {
  const insets = useSafeAreaInsets();
  const { orderAmount, cancelCharge, chargePct, refund, prepStarted } = resolveCancelBreakdown(order);
  const title = resolveCancelTitle(prepStarted);
  const [reasonSheetVisible, setReasonSheetVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleReasonSelected = async (reason: FoodCancelReason) => {
    setCancelling(true);
    try {
      await orderService.cancelFoodOrder(order.orderId, {
        reasonCode: reason.id,
        reasonText: reason.label,
      });
      setReasonSheetVisible(false);
      onClose();
      onCancelled?.();
      Alert.alert("Order cancelled", "Your order has been cancelled successfully.");
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not cancel order. Please try again or contact support.";
      Alert.alert("Cancellation failed", message, [
        { text: "OK" },
        { text: "Get help", onPress: onOpenHelp },
      ]);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.82}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <View style={styles.heroIconWrap}>
          <Text style={styles.heroEmoji}>🍜</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {prepStarted
            ? `${chargePct}% cancellation charges apply after food preparation has started. No refund will be issued.`
            : "You can cancel this order, but no refund will be issued once the order is placed."}
        </Text>

        <View style={styles.quickRow}>
          <View style={[styles.quickCard, styles.quickCardDisabled]}>
            <Ionicons name="add-circle-outline" size={22} color={MUTED} />
            <Text style={[styles.quickLabel, styles.quickLabelDisabled]}>Add more items</Text>
          </View>
          <View style={[styles.quickCard, styles.quickCardDisabled]}>
            <Ionicons name="location-outline" size={22} color={MUTED} />
            <Text style={[styles.quickLabel, styles.quickLabelDisabled]}>Change address</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Continue with cancellation</Text>

        <View style={styles.breakdownCard}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Order amount</Text>
            <Text style={styles.breakdownValue}>{formatMoney(orderAmount)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Cancellation charges ({chargePct}%)</Text>
            <Text style={[styles.breakdownValue, styles.chargeValue]}>
              {formatMoney(cancelCharge)}
            </Text>
          </View>
          <View style={[styles.breakdownRow, styles.refundRow]}>
            <Text style={styles.refundLabel}>Your refund</Text>
            <Text style={[styles.refundValue, styles.noRefundValue]}>{formatMoney(refund)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          activeOpacity={0.9}
          onPress={() => setReasonSheetVisible(true)}
          disabled={cancelling}
        >
          <Text style={styles.cancelBtnText}>Cancel order · No refund</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chatLink}
          activeOpacity={0.85}
          onPress={() => {
            onClose();
            onOpenChat();
          }}
        >
          <Text style={styles.chatLinkText}>Chat with delivery partner</Text>
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>

    <FoodCancelReasonSheet
      visible={reasonSheetVisible}
      loading={cancelling}
      onClose={() => {
        if (!cancelling) setReasonSheetVisible(false);
      }}
      onSelectReason={(reason) => {
        void handleReasonSelected(reason);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  heroIconWrap: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  heroEmoji: { fontSize: 56 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
    paddingHorizontal: 24,
    marginBottom: 18,
  },
  quickRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  quickCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FAFAFA",
  },
  quickCardDisabled: {
    opacity: 0.55,
    backgroundColor: "#F3F4F6",
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT,
    textAlign: "center",
  },
  quickLabelDisabled: {
    color: MUTED,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  breakdownCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#FAFAFA",
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  breakdownLabel: { fontSize: 14, color: MUTED },
  breakdownValue: { fontSize: 14, fontWeight: "600", color: TEXT },
  chargeValue: { color: DESTRUCTIVE, fontWeight: "700" },
  refundRow: { marginBottom: 0, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  refundLabel: { fontSize: 15, fontWeight: "700", color: TEXT },
  refundValue: { fontSize: 16, fontWeight: "800", color: TEXT },
  noRefundValue: { color: MUTED },
  cancelBtn: {
    marginHorizontal: 16,
    backgroundColor: DESTRUCTIVE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  chatLink: {
    alignItems: "center",
    paddingVertical: 16,
  },
  chatLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: MINT,
  },
});
