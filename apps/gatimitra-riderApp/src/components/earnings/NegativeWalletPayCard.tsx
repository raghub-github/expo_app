import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import {
  useRiderSubscriptionStatus,
  useRiderSubscriptionPayDues,
} from "@/src/hooks/useRiderSubscription";
import { useRiderSubscriptionDuesPayment } from "@/src/hooks/useRiderSubscriptionDuesPayment";
import { useRiderPenaltyPayment } from "@/src/hooks/useRiderPenaltyPayment";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { openRazorpayCheckout, isNativeRazorpayAvailable } from "@/src/lib/razorpay-native";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";

function formatRupee(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Earnings-page settle card. Shown ONLY when the wallet balance is negative.
 * The amount is read-only (= abs(balance)). Routes to the correct native flow:
 * subscription dues when dues exist, otherwise the negative-wallet (penalty) flow.
 * Hidden entirely when the wallet is zero or positive.
 */
export function NegativeWalletPayCard() {
  const { t } = useTranslation();
  const { data: earnings, refetch } = useEarningsSummary();
  const { data: subStatus, refetch: refetchSub } = useRiderSubscriptionStatus();
  const { data: riderProfile } = useRiderProfile();
  const subDuesPayment = useRiderSubscriptionDuesPayment();
  const payDuesFromWallet = useRiderSubscriptionPayDues();
  const penaltyPayment = useRiderPenaltyPayment();
  const [paying, setPaying] = useState(false);

  const balance = earnings?.totalBalance ?? 0;
  const payable = balance < 0 ? Math.round(-balance * 100) / 100 : 0;
  const subscriptionDue = subStatus?.dues?.totalDue ?? 0;
  const canPayFromWallet = subStatus?.dues?.alertBanner?.canPayFromWallet === true;

  const refreshAll = useCallback(async () => {
    await Promise.all([refetch(), refetchSub()]);
  }, [refetch, refetchSub]);

  const runNative = useCallback(
    async (order: { orderId: string; keyId: string; amount: number }, description: string) => {
      const result = await openRazorpayCheckout({
        order: { orderId: order.orderId, amount: order.amount, keyId: order.keyId },
        prefill: { name: riderProfile?.name, contact: riderProfile?.mobile },
        name: "GatiMitra",
        description,
        themeColor: "#0EA47A",
      });
      return result;
    },
    [riderProfile?.name, riderProfile?.mobile]
  );

  const handlePay = useCallback(async () => {
    if (paying || payable <= 0) return;
    setPaying(true);
    try {
      if (!isNativeRazorpayAvailable()) {
        Alert.alert(
          t("common.error", "Error"),
          t("earnings.payNativeMissing", "Please update the app to complete this payment.")
        );
        setPaying(false);
        return;
      }

      // Subscription dues take priority (separate accounting); otherwise the
      // negative wallet is a penalty balance.
      if (subscriptionDue > 0) {
        if (canPayFromWallet) {
          const walletRes = await payDuesFromWallet.mutateAsync();
          await refreshAll();
          if (walletRes.totalDueAfter <= 0) {
            setPaying(false);
            return;
          }
        }
        const order = await subDuesPayment.createOrder.mutateAsync();
        if (!order.success || !order.orderId || !order.keyId) {
          throw new Error(t("subscription.payFailed", "Payment failed"));
        }
        if (order.dummyMode || order.keyId === "dummy_key") {
          setPaying(false);
          return;
        }
        try {
          const r = await runNative(order, "Subscription dues");
          await subDuesPayment.verifyPayment.mutateAsync({
            razorpayOrderId: r.razorpayOrderId,
            razorpayPaymentId: r.razorpayPaymentId,
            razorpaySignature: r.razorpaySignature,
          });
          await refreshAll();
        } catch {
          setPaying(false);
        }
        return;
      }

      // Penalty / negative-wallet recovery.
      const order = await penaltyPayment.createOrder.mutateAsync();
      if (!order.success || !order.orderId || !order.keyId) {
        throw new Error(t("home.penaltyPayFailedMessage", "Could not start payment."));
      }
      if (order.dummyMode || order.keyId === "dummy_key") {
        setPaying(false);
        return;
      }
      try {
        const r = await runNative(order, "Negative wallet settlement");
        await penaltyPayment.verifyPayment.mutateAsync({
          razorpayOrderId: r.razorpayOrderId,
          razorpayPaymentId: r.razorpayPaymentId,
          razorpaySignature: r.razorpaySignature,
        });
        await refreshAll();
      } catch {
        void penaltyPayment.recordAttempt
          .mutateAsync({ razorpayOrderId: order.orderId, status: "cancelled" })
          .catch(() => undefined);
        setPaying(false);
      }
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        extractApiErrorMessage(e, t("home.penaltyPayFailedMessage", "Could not start payment."))
      );
    } finally {
      setPaying(false);
    }
  }, [
    paying,
    payable,
    subscriptionDue,
    canPayFromWallet,
    payDuesFromWallet,
    subDuesPayment.createOrder,
    subDuesPayment.verifyPayment,
    penaltyPayment.createOrder,
    penaltyPayment.verifyPayment,
    penaltyPayment.recordAttempt,
    runNative,
    refreshAll,
    t,
  ]);

  // Hidden when the wallet is zero or positive.
  if (payable <= 0) return null;

  const reason =
    subscriptionDue > 0
      ? t("earnings.negativeSubscription", "Subscription dues have made your wallet negative.")
      : t("earnings.negativePenalty", "A penalty has made your wallet negative. Clear it to receive orders.");

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle" size={20} color="#B45309" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>
            {t("earnings.settleTitle", "Clear your negative balance")}
          </Text>
          <Text style={styles.sub}>{reason}</Text>
        </View>
      </View>
      <Pressable
        style={[styles.payBtn, paying && styles.payBtnDisabled]}
        onPress={() => void handlePay()}
        disabled={paying}
        accessibilityRole="button"
      >
        {paying ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.payBtnText}>
            {t("earnings.payExact", "Pay ₹{{amount}}", { amount: formatRupee(payable) })}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "800", color: "#92400E" },
  sub: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: "#B45309" },
  payBtn: {
    backgroundColor: colors.primary[600],
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },
});
