import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  useRiderSubscriptionStatus,
  useRiderSubscriptionPayDues,
  type RiderSubscriptionAlertBanner,
} from "@/src/hooks/useRiderSubscription";
import { useRiderSubscriptionDuesPayment } from "@/src/hooks/useRiderSubscriptionDuesPayment";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import {
  openRazorpayCheckout,
  isNativeRazorpayAvailable,
  extractRazorpayError,
  isRazorpayUserCancel,
} from "@/src/lib/razorpay-native";
import { extractApiErrorMessage } from "@/src/services/http";
import { BannerPagerIndicators } from "@/src/components/home/HomeAlertBannerCarousel";
import { openHostedRazorpayCheckout } from "@/src/components/payment/RazorpayCheckoutModal";

function formatRupee(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function resolveBannerCopy(banner: RiderSubscriptionAlertBanner) {
  return {
    title: banner.title,
    subtitle: banner.subtitle,
    payLabel: banner.payButtonLabel,
  };
}

export function SubscriptionDuesBanner({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { data: status, refetch } = useRiderSubscriptionStatus();
  const { data: riderProfile } = useRiderProfile();
  const payDues = useRiderSubscriptionPayDues();
  const duesPayment = useRiderSubscriptionDuesPayment();
  const [paying, setPaying] = useState(false);

  const banner = status?.dues?.alertBanner;
  const totalDue = banner?.totalDue ?? 0;
  const canPayFromWallet = banner?.canPayFromWallet === true;

  const handleVerifyPayment = useCallback(
    async (razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) => {
      setPaying(true);
      try {
        const result = await duesPayment.verifyPayment.mutateAsync({
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        });
        await refetch();
        if (result.totalDueAfter > 0) {
          Alert.alert(
            t("subscription.duesPartialTitle", "Partial payment"),
            t(
              "subscription.duesPartialBody",
              "{{paid}} paid. Outstanding: {{remaining}}.",
              {
                paid: formatRupee(result.paidAmount),
                remaining: formatRupee(result.totalDueAfter),
              }
            )
          );
        } else {
          Alert.alert(
            t("subscription.duesPaidTitle", "Payment successful"),
            t(
              "subscription.duesPaidMessage",
              "Subscription dues of {{amount}} cleared.",
              { amount: formatRupee(result.paidAmount) }
            )
          );
        }
      } catch (e) {
        Alert.alert(
          t("common.error", "Error"),
          extractApiErrorMessage(e, t("subscription.payFailed", "Payment failed"))
        );
      } finally {
        setPaying(false);
      }
    },
    [duesPayment.verifyPayment, refetch, t]
  );

  const handlePay = useCallback(async () => {
    if (paying || duesPayment.createOrder.isPending || payDues.isPending) return;
    setPaying(true);
    try {
      // Prefer wallet settlement when balance covers (or partially covers) dues.
      if (canPayFromWallet) {
        const result = await payDues.mutateAsync();
        await refetch();
        if (result.paidAmount > 0 && result.totalDueAfter <= 0) {
          Alert.alert(
            t("subscription.duesPaidTitle", "Payment successful"),
            t(
              "subscription.duesPaidFromWallet",
              "{{amount}} cleared from wallet.",
              { amount: formatRupee(result.paidAmount) }
            )
          );
          return;
        }
        if (result.paidAmount > 0 && result.totalDueAfter > 0) {
          Alert.alert(
            t("subscription.duesPartialTitle", "Partial payment"),
            t(
              "subscription.duesPartialBody",
              "{{paid}} paid from wallet. Outstanding: {{remaining}}.",
              {
                paid: formatRupee(result.paidAmount),
                remaining: formatRupee(result.totalDueAfter),
              }
            )
          );
          // Continue to Razorpay for remaining if still due
        }
        if (result.totalDueAfter <= 0) return;
      }

      const order = await duesPayment.createOrder.mutateAsync();
      if (!order.success || !order.orderId || !order.keyId) {
        throw new Error(t("subscription.payFailed", "Payment failed"));
      }

      if (order.dummyMode || order.keyId === "dummy_key") {
        Alert.alert(
          t("subscription.payTitle", "Pay subscription dues"),
          t(
            "subscription.payDummyMessage",
            "Dummy payment mode — simulate Razorpay success for {{amount}}?",
            { amount: formatRupee(order.amountRupees ?? totalDue) }
          ),
          [
            { text: t("common.cancel", "Cancel"), style: "cancel", onPress: () => setPaying(false) },
            {
              text: t("home.simulatePayment", "Simulate payment"),
              onPress: () => {
                void handleVerifyPayment(order.orderId, `pay_${Date.now()}`, "simulated_signature");
              },
            },
          ]
        );
        return;
      }

      if (isNativeRazorpayAvailable()) {
        try {
          const result = await openRazorpayCheckout({
            order: {
              orderId: order.orderId,
              amount: order.amount,
              keyId: order.keyId,
            },
            prefill: { name: riderProfile?.name, contact: riderProfile?.mobile },
            name: "GatiMitra",
            description: "Subscription dues",
            themeColor: "#D4A017",
          });
          await handleVerifyPayment(
            result.razorpayOrderId,
            result.razorpayPaymentId,
            result.razorpaySignature
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

      // Expo Go / builds without native SDK — hosted browser checkout.
      const hosted = await openHostedRazorpayCheckout({
        orderParams: {
          orderId: order.orderId,
          keyId: order.keyId,
          amount: order.amount,
        },
        prefill: { name: riderProfile?.name, contact: riderProfile?.mobile },
        themeColor: "#D4A017",
      });
      if (hosted) {
        await handleVerifyPayment(
          hosted.razorpayOrderId,
          hosted.razorpayPaymentId,
          hosted.razorpaySignature
        );
      }
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        extractApiErrorMessage(e, t("subscription.payFailed", "Payment failed"))
      );
    } finally {
      setPaying(false);
    }
  }, [
    canPayFromWallet,
    duesPayment.createOrder,
    handleVerifyPayment,
    payDues,
    paying,
    refetch,
    riderProfile?.name,
    riderProfile?.mobile,
    t,
    totalDue,
  ]);

  if (!banner?.visible) return null;

  const copy = resolveBannerCopy(banner);

  return (
    <View
      style={[styles.wrap, styles.wrapWarning, embedded && styles.wrapEmbedded]}
      collapsable={false}
    >
      <View style={styles.icon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.sub}>{copy.subtitle}</Text>
      </View>
      <View style={styles.ctaCol} collapsable={false}>
        <TouchableOpacity
          style={[styles.payBtn, paying && { opacity: 0.7 }]}
          onPress={() => void handlePay()}
          disabled={paying}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.85}
          delayPressIn={0}
        >
          {paying ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <Text style={styles.payBtnTxt}>{copy.payLabel}</Text>
          )}
        </TouchableOpacity>
        <BannerPagerIndicators />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 12,
  },
  wrapEmbedded: {},
  ctaCol: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 6,
    marginLeft: 2,
  },
  wrapWarning: {
    backgroundColor: "#D4A017",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 17,
  },
  sub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255,255,255,0.92)",
  },
  payBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
  },
  payBtnTxt: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
});
