/**
 * GatiMitra-style order cancellation bottom sheet with charge breakdown.
 */

import { useState, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { FoodCancelReasonSheet } from "@/components/orders/FoodCancelReasonSheet";
import { FoodOrderCancelledAckSheet } from "@/components/orders/FoodOrderCancelledAckSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { resolveOrderCustomerPaidAmount } from "@/lib/orderBillBreakdown";
import type { FoodCancelReason } from "@/lib/food-cancel-reasons";
import {
  isCustomerOrderOnTheWayStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";
import { useQueryClient } from "@tanstack/react-query";
import { refreshCustomerWallet } from "@/lib/refreshCustomerWallet";

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
  /** When false, "Chat with delivery partner" is disabled (no rider assigned yet). */
  chatEnabled?: boolean;
  /** Hide rider chat entirely (self-pickup / takeaway). Default true. */
  showPartnerChat?: boolean;
};

function formatMoney(value: number) {
  return `₹${value.toFixed(2)}`;
}

/** True until the restaurant has accepted — customer cancel gets a full refund. */
function isPreMerchantAcceptStatus(status: string): boolean {
  const s = normalizeCustomerOrderStatus(status);
  return (
    s === "ORDER_PLACED" ||
    s === "CREATED" ||
    s === "PLACED" ||
    s === "NEW" ||
    s === "ORDER_RECEIVED"
  );
}

function resolveCancelBreakdown(order: OrderDetail) {
  /** Cashin + GatiCash only — never reconstructed pre-discount bill. */
  const orderAmount = resolveOrderCustomerPaidAmount(order);
  const status = normalizeCustomerOrderStatus(order.status);
  const preAccept = isPreMerchantAcceptStatus(status);
  const prepStarted =
    !preAccept &&
    (status === "PREPARING" ||
      status === "READY" ||
      status === "READY_FOR_PICKUP" ||
      isCustomerOrderOnTheWayStatus(status) ||
      status === "RIDER_ASSIGNED" ||
      status === "ASSIGNED" ||
      status === "REACHED_STORE" ||
      status === "ACCEPTED");

  if (preAccept) {
    return {
      orderAmount,
      cancelCharge: 0,
      chargePct: 0,
      refund: orderAmount,
      prepStarted: false,
      preAccept: true,
    };
  }

  const chargePct = 100;
  const cancelCharge = orderAmount;
  const refund = 0;
  return { orderAmount, cancelCharge, chargePct, refund, prepStarted, preAccept: false };
}

function resolveCancelTitle(prepStarted: boolean, preAccept: boolean): string {
  if (preAccept) return "Cancel this order?";
  return prepStarted ? "Food under preparation" : "Cancel this order?";
}

export function FoodOrderCancelSheet({
  visible,
  order,
  onClose,
  onOpenHelp,
  onOpenChat,
  onCancelled,
  chatEnabled = false,
  showPartnerChat = true,
}: FoodOrderCancelSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { orderAmount, cancelCharge, chargePct, refund, prepStarted, preAccept } =
    resolveCancelBreakdown(order);
  const title = resolveCancelTitle(prepStarted, preAccept);
  const [reasonSheetVisible, setReasonSheetVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [ackVisible, setAckVisible] = useState(false);
  const [ackMessage, setAckMessage] = useState("");

  const riderAssigned = useMemo(() => {
    if (chatEnabled) return true;
    const rider = order.rider;
    if (!rider) return false;
    return Boolean(rider.name?.trim() || rider.phone?.trim());
  }, [chatEnabled, order.rider]);

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
      // Refund credit is applied server-side before cancel returns — refresh now.
      void refreshCustomerWallet(queryClient);
      setAckMessage(
        preAccept
          ? "Your order has been cancelled. A full refund will be processed."
          : "Your order has been cancelled successfully."
      );
      setAckVisible(true);
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
          <AppText style={styles.heroEmoji}>🍜</AppText>
        </View>

        <AppText style={styles.title}>{title}</AppText>
        <AppText style={styles.subtitle}>
          {preAccept
            ? "The restaurant hasn’t accepted yet. Cancel now and you’ll get a full refund."
            : prepStarted
              ? `${chargePct}% cancellation charges apply after the restaurant has accepted. No refund will be issued.`
              : "The restaurant has accepted this order. Cancellation charges apply and no refund will be issued."}
        </AppText>

        <View style={styles.quickRow}>
          <View style={[styles.quickCard, styles.quickCardDisabled]}>
            <Ionicons name="add-circle-outline" size={22} color={MUTED} />
            <AppText style={[styles.quickLabel, styles.quickLabelDisabled]}>Add more items</AppText>
          </View>
          <View style={[styles.quickCard, styles.quickCardDisabled]}>
            <Ionicons name="location-outline" size={22} color={MUTED} />
            <AppText style={[styles.quickLabel, styles.quickLabelDisabled]}>Change address</AppText>
          </View>
        </View>

        <AppText style={styles.sectionTitle}>Continue with cancellation</AppText>

        <View style={styles.breakdownCard}>
          <View style={styles.breakdownRow}>
            <AppText style={styles.breakdownLabel}>Order amount</AppText>
            <AppText style={styles.breakdownValue}>{formatMoney(orderAmount)}</AppText>
          </View>
          <View style={styles.breakdownRow}>
            <AppText style={styles.breakdownLabel}>Cancellation charges ({chargePct}%)</AppText>
            <AppText
              style={[
                styles.breakdownValue,
                cancelCharge > 0.005 ? styles.chargeValue : null,
              ]}
            >
              {formatMoney(cancelCharge)}
            </AppText>
          </View>
          <View style={[styles.breakdownRow, styles.refundRow]}>
            <AppText style={styles.refundLabel}>Your refund</AppText>
            <AppText
              style={[
                styles.refundValue,
                refund > 0.005 ? styles.fullRefundValue : styles.noRefundValue,
              ]}
            >
              {formatMoney(refund)}
            </AppText>
          </View>
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          activeOpacity={0.9}
          onPress={() => setReasonSheetVisible(true)}
          disabled={cancelling}
        >
          <AppText style={styles.cancelBtnText}>
            {preAccept ? "Cancel order · Full refund" : "Cancel order · No refund"}
          </AppText>
        </TouchableOpacity>

        {showPartnerChat ? (
          <TouchableOpacity
            style={styles.chatLink}
            activeOpacity={riderAssigned ? 0.85 : 1}
            disabled={!riderAssigned}
            onPress={() => {
              if (!riderAssigned) return;
              onClose();
              onOpenChat();
            }}
          >
            <AppText
              style={[styles.chatLinkText, !riderAssigned && styles.chatLinkTextDisabled]}
            >
              Chat with delivery partner
            </AppText>
            {!riderAssigned ? (
              <AppText style={styles.chatLinkHint}>Available once a partner is assigned</AppText>
            ) : null}
          </TouchableOpacity>
        ) : null}
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

    <FoodOrderCancelledAckSheet
      visible={ackVisible}
      message={ackMessage}
      onDismiss={() => setAckVisible(false)}
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
  fullRefundValue: { color: MINT },
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
  chatLinkTextDisabled: {
    color: MUTED,
    fontWeight: "600",
  },
  chatLinkHint: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
  },
});
