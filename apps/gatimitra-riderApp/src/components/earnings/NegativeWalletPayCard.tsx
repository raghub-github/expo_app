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
import {
  openRazorpayCheckout,
  isNativeRazorpayAvailable,
  extractRazorpayError,
  isRazorpayUserCancel,
} from "@/src/lib/razorpay-native";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";

function formatRupee(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Earnings-page settle card. Shown ONLY when the wallet balance is negative.
 * Amount is read-only (= abs(balance)). Native Razorpay Android/iOS SDK only.
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
    // Reconcile first so a captured-but-unconfirmed (delayed/webhook-less) payment is
    // settled server-side before we re-read the balance — otherwise the wallet would
    // still show negative right after a payment that the verify call missed.
    try {
      await penaltyPayment.reconcile.mutateAsync();
    } catch {
      // best-effort — never block the balance refresh on reconciliation
    }
    await Promise.all([refetch(), refetchSub()]);
  }, [penaltyPayment.reconcile, refetch, refetchSub]);

  const runNative = useCallback(
    async (order: { orderId: string; keyId: string; amount: number }, description: string) => {
      return openRazorpayCheckout({
        order: {
          orderId: order.orderId,
          amount: order.amount,
          keyId: order.keyId,
        },
        prefill: { name: riderProfile?.name, contact: riderProfile?.mobile },
        name: "GatiMitra",
        description,
        themeColor: "#0EA47A",
      });
    },
    [riderProfile?.name, riderProfile?.mobile]
  );

  const simulateOrAlertDummy = useCallback(
    (
      order: { orderId: string; amountRupees?: number; amount: number },
      verify: (orderId: string, paymentId: string, signature: string) => Promise<void>
    ) => {
      const amountLabel = formatRupee(order.amountRupees ?? order.amount / 100);
      Alert.alert(
        t("earnings.payTitle", "Clear negative balance"),
        t(
          "earnings.payDummyMessage",
          "Dummy payment mode — simulate Razorpay success for ₹{{amount}}?",
          { amount: amountLabel }
        ),
        [
          {
            text: t("common.cancel", "Cancel"),
            style: "cancel",
            onPress: () => setPaying(false),
          },
          {
            text: t("home.simulatePayment", "Simulate payment"),
            onPress: () => {
              void verify(order.orderId, `pay_${Date.now()}`, "simulated_signature").finally(() =>
                setPaying(false)
              );
            },
          },
        ]
      );
    },
    [t]
  );

  const handlePay = useCallback(async () => {
    if (paying || payable <= 0) return;
    setPaying(true);
    try {
      // Subscription dues take priority when present.
      if (subscriptionDue > 0) {
        if (canPayFromWallet) {
          const walletRes = await payDuesFromWallet.mutateAsync();
          await refreshAll();
          if (walletRes.totalDueAfter <= 0) {
            Alert.alert(
              t("subscription.duesPaidTitle", "Payment successful"),
              t("subscription.duesPaidFromWallet", "{{amount}} cleared from wallet.", {
                amount: `₹${formatRupee(walletRes.paidAmount ?? 0)}`,
              })
            );
            return;
          }
        }
        const order = await subDuesPayment.createOrder.mutateAsync();
        if (!order.success || !order.orderId || !order.keyId) {
          throw new Error(t("subscription.payFailed", "Payment failed"));
        }
        if (order.dummyMode || order.keyId === "dummy_key") {
          simulateOrAlertDummy(order, async (oid, pid, sig) => {
            await subDuesPayment.verifyPayment.mutateAsync({
              razorpayOrderId: oid,
              razorpayPaymentId: pid,
              razorpaySignature: sig,
            });
            await refreshAll();
            Alert.alert(
              t("subscription.duesPaidTitle", "Payment successful"),
              t("subscription.duesPaidMessage", "Subscription dues cleared.")
            );
          });
          return;
        }
        if (!isNativeRazorpayAvailable()) {
          Alert.alert(
            t("common.error", "Error"),
            t(
              "earnings.payNativeMissing",
              "Native Razorpay is not available in this build. Please install the latest Play Store / APK build (not Expo Go)."
            )
          );
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
          Alert.alert(
            t("subscription.duesPaidTitle", "Payment successful"),
            t("subscription.duesPaidMessage", "Subscription dues cleared.")
          );
        } catch (rzpErr) {
          if (!isRazorpayUserCancel(rzpErr)) {
            const { description, code } = extractRazorpayError(rzpErr);
            Alert.alert(
              t("common.error", "Error"),
              description || code || t("subscription.payFailed", "Payment failed")
            );
          }
        }
        return;
      }

      // Penalty / negative-wallet recovery.
      const order = await penaltyPayment.createOrder.mutateAsync();
      if (!order.success || !order.orderId || !order.keyId) {
        throw new Error(t("home.penaltyPayFailedMessage", "Could not start payment."));
      }
      if (order.dummyMode || order.keyId === "dummy_key") {
        simulateOrAlertDummy(order, async (oid, pid, sig) => {
          await penaltyPayment.verifyPayment.mutateAsync({
            razorpayOrderId: oid,
            razorpayPaymentId: pid,
            razorpaySignature: sig,
          });
          await refreshAll();
          Alert.alert(
            t("earnings.paySuccessTitle", "Payment successful"),
            t("earnings.paySuccessBody", "Your wallet balance has been updated.")
          );
        });
        return;
      }
      if (!isNativeRazorpayAvailable()) {
        Alert.alert(
          t("common.error", "Error"),
          t(
            "earnings.payNativeMissing",
            "Native Razorpay is not available in this build. Please install the latest Play Store / APK build (not Expo Go)."
          )
        );
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
        Alert.alert(
          t("earnings.paySuccessTitle", "Payment successful"),
          t("earnings.paySuccessBody", "Your wallet balance has been updated.")
        );
      } catch (rzpErr) {
        void penaltyPayment.recordAttempt
          .mutateAsync({
            razorpayOrderId: order.orderId,
            status: isRazorpayUserCancel(rzpErr) ? "cancelled" : "failed",
            reason: extractRazorpayError(rzpErr).description || undefined,
          })
          .catch(() => undefined);
        if (!isRazorpayUserCancel(rzpErr)) {
          const { description, code } = extractRazorpayError(rzpErr);
          Alert.alert(
            t("common.error", "Error"),
            description || code || t("home.penaltyPayFailedMessage", "Could not start payment.")
          );
        }
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
    simulateOrAlertDummy,
    t,
  ]);

  if (payable <= 0) return null;

  const reason =
    subscriptionDue > 0
      ? t("earnings.negativeSubscription", "Subscription dues have made your wallet negative.")
      : t(
          "earnings.negativePenalty",
          "A penalty has made your wallet negative. Clear it to receive orders."
        );

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
        onPress={() => {
          void handlePay();
        }}
        disabled={paying}
        accessibilityRole="button"
        hitSlop={8}
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
