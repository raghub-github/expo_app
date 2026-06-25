import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  useRiderSubscriptionStatus,
  type RiderSubscriptionAlertBanner,
} from "@/src/hooks/useRiderSubscription";
import { useRiderSubscriptionDuesPayment } from "@/src/hooks/useRiderSubscriptionDuesPayment";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import {
  RazorpayCheckoutModal,
  type RazorpayOrderParams,
} from "@/src/components/payment/RazorpayCheckoutModal";
import { extractApiErrorMessage } from "@/src/services/http";
import { BannerPagerIndicators } from "@/src/components/home/HomeAlertBannerCarousel";

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
  const { data: status } = useRiderSubscriptionStatus();
  const { data: riderProfile } = useRiderProfile();
  const duesPayment = useRiderSubscriptionDuesPayment();
  const [paying, setPaying] = useState(false);
  const [checkout, setCheckout] = useState<RazorpayOrderParams | null>(null);

  const banner = status?.dues?.alertBanner;
  if (!banner?.visible) return null;

  const isRestricted = banner.variant === "restricted";
  const copy = resolveBannerCopy(banner);
  const totalDue = banner.totalDue;

  const handleVerifyPayment = useCallback(
    async (razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) => {
      setPaying(true);
      try {
        const result = await duesPayment.verifyPayment.mutateAsync({
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        });
        setCheckout(null);
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
    [duesPayment.verifyPayment, t]
  );

  const handlePay = useCallback(async () => {
    if (paying || duesPayment.createOrder.isPending) return;
    setPaying(true);
    try {
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

      setCheckout({
        orderId: order.orderId,
        keyId: order.keyId,
        amount: order.amount,
      });
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        extractApiErrorMessage(e, t("subscription.payFailed", "Payment failed"))
      );
    } finally {
      setPaying(false);
    }
  }, [duesPayment.createOrder, handleVerifyPayment, paying, t, totalDue]);

  return (
    <>
      <View
        style={[
          styles.wrap,
          isRestricted ? styles.wrapRestricted : styles.wrapWarning,
          embedded && styles.wrapEmbedded,
        ]}
      >
        <View style={styles.icon}>
          <Ionicons name="warning" size={18} color="#ffffff" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.sub}>{copy.subtitle}</Text>
        </View>
        <View style={styles.ctaCol}>
          <Pressable
            style={[styles.payBtn, paying && { opacity: 0.7 }]}
            onPress={() => void handlePay()}
            disabled={paying}
          >
            {paying ? (
              <ActivityIndicator size="small" color={isRestricted ? "#DC2626" : "#111827"} />
            ) : (
              <Text style={[styles.payBtnTxt, isRestricted && styles.payBtnTxtRestricted]}>
                {copy.payLabel}
              </Text>
            )}
          </Pressable>
          <BannerPagerIndicators />
        </View>
      </View>

      <RazorpayCheckoutModal
        visible={checkout != null}
        orderParams={checkout}
        prefill={{
          contact: riderProfile?.mobile ?? null,
          name: riderProfile?.name ?? null,
        }}
        themeColor="#D4A017"
        onSuccess={(result) => {
          void handleVerifyPayment(
            result.razorpayOrderId,
            result.razorpayPaymentId,
            result.razorpaySignature
          );
        }}
        onCancel={() => setCheckout(null)}
      />
    </>
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
  wrapRestricted: {
    backgroundColor: "#DC2626",
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
  payBtnTxtRestricted: {
    color: "#DC2626",
  },
});
