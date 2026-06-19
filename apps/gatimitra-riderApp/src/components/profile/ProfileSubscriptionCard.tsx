// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { ProfilePromoCard } from "@/src/components/profile/ProfilePromoCard";
import {
  pickFeaturedPlan,
  useRiderSubscriptionPlans,
  useRiderSubscriptionStatus,
} from "@/src/hooks/useRiderSubscription";

function formatRupee(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function ProfileSubscriptionCard() {
  const { t } = useTranslation();
  const { data: plans = [] } = useRiderSubscriptionPlans();
  const { data: status } = useRiderSubscriptionStatus();

  const plan = pickFeaturedPlan(plans);
  const isActive = Boolean(status?.active);
  const featured = plan?.featuredPrice;

  if (!plan) return null;

  const subtitle = isActive
    ? t("subscription.enjoyBenefits", "You are enjoying membership benefits")
    : featured
      ? t("subscription.priceNote", {
          price: formatRupee(featured.total),
          cycle: featured.cycleLabel,
          defaultValue: `${formatRupee(featured.total)} / ${featured.cycleLabel} + GST`,
        })
      : plan.tagline || t("subscription.tapToView", "Tap to view plans");

  return (
    <ProfilePromoCard
      colors={["#4C1D95", "#6D28D9", "#7C3AED"]}
      shadowColor="#6D28D9"
      icon={<MaterialCommunityIcons name="crown" size={22} color="#FBBF24" />}
      title={plan.planName}
      subtitle={subtitle}
      onPress={() => router.push("/your-subscription")}
      trailing={
        isActive ? (
          <View style={styles.activeChip}>
            <Text style={styles.activeChipTxt}>{t("subscription.activePlan", "ACTIVE")}</Text>
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  activeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(16, 185, 129, 0.35)",
    flexShrink: 0,
  },
  activeChipTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D1FAE5",
    letterSpacing: 0.3,
  },
});
