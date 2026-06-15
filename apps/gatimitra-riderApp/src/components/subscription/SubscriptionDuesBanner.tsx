import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import {
  useRiderSubscriptionPayDues,
  useRiderSubscriptionStatus,
  type RiderSubscriptionAlertBanner,
} from "@/src/hooks/useRiderSubscription";
import { extractApiErrorMessage } from "@/src/services/http";

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

export function SubscriptionDuesBanner() {
  const { t } = useTranslation();
  const { data: status } = useRiderSubscriptionStatus();
  const payDues = useRiderSubscriptionPayDues();
  const [paying, setPaying] = useState(false);

  const banner = status?.dues?.alertBanner;
  if (!banner?.visible) return null;

  const isRestricted = banner.variant === "restricted";
  const copy = resolveBannerCopy(banner);

  const handlePay = async () => {
    if (paying) return;

    if (!banner.canPayFromWallet) {
      Alert.alert(
        t("subscription.duesNeedEarningsTitle", "Earn to clear dues"),
        t("subscription.banner.needEarningsBody", {
          defaultValue: banner.subtitle,
          totalDue: formatRupee(banner.totalDue),
          walletBalance: formatRupee(banner.walletBalance),
        }),
        [
          { text: t("common.cancel", "Cancel"), style: "cancel" },
          {
            text: t("subscription.viewWallet", "View wallet"),
            onPress: () => router.push("/(tabs)/earnings"),
          },
        ]
      );
      return;
    }

    setPaying(true);
    try {
      const result = await payDues.mutateAsync();
      if (result.totalDueAfter > 0) {
        Alert.alert(
          t("subscription.duesPartialTitle", "Partial payment"),
          t(
            "subscription.duesPartialBody",
            "{{paid}} paid. Outstanding: {{remaining}}. Complete deliveries to earn more.",
            {
              paid: formatRupee(result.paidAmount),
              remaining: formatRupee(result.totalDueAfter),
            }
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
  };

  return (
    <View style={[styles.wrap, isRestricted ? styles.wrapRestricted : styles.wrapWarning]}>
      <View style={styles.icon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.sub}>{copy.subtitle}</Text>
      </View>
      <Pressable
        style={[styles.payBtn, paying && { opacity: 0.7 }]}
        onPress={handlePay}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
