import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { SubscriptionBottomSheet } from "@/src/components/subscription/SubscriptionBottomSheet";
import {
  billingCycleLabel,
  pickFeaturedPlan,
  useRiderSubscriptionPlans,
  useRiderSubscriptionStatus,
  type RiderSubscriptionPlan,
} from "@/src/hooks/useRiderSubscription";

function formatRupee(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function expiryLabel(expiryDate?: string | null): { text: string; highlight: boolean } {
  if (!expiryDate) return { text: "—", highlight: false };
  const end = new Date(expiryDate);
  if (Number.isNaN(end.getTime())) return { text: "—", highlight: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((endDay.getTime() - today.getTime()) / 86_400_000);

  if (diffDays <= 0) return { text: "Today", highlight: true };
  if (diffDays === 1) return { text: "Tomorrow", highlight: true };
  return {
    text: end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    highlight: false,
  };
}

function resolvePlan(
  plans: RiderSubscriptionPlan[],
  planId?: number
): RiderSubscriptionPlan | null {
  if (!plans.length) return null;
  if (planId) {
    const match = plans.find((p) => p.id === planId);
    if (match) return match;
  }
  return pickFeaturedPlan(plans);
}

export function YourSubscriptionScreen() {
  const { t } = useTranslation();
  const { data: plans = [], isLoading: plansLoading } = useRiderSubscriptionPlans();
  const { data: status, isLoading: statusLoading } = useRiderSubscriptionStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = Boolean(status?.active);
  const activePlan = status?.plan;
  const plan = useMemo(
    () => resolvePlan(plans, activePlan?.planId),
    [plans, activePlan?.planId]
  );

  const featured = plan?.featuredPrice;
  const cycle = activePlan?.billingCycle ?? featured?.billingCycle ?? "monthly";
  const cycleText = billingCycleLabel(cycle as Parameters<typeof billingCycleLabel>[0]);
  const expiry = expiryLabel(activePlan?.expiryDate);
  const accent = plan?.badgeColor ?? "#7C3AED";

  const listPrice = featured ? Math.round(featured.total * 11) : null;
  const payPrice = featured?.total ?? null;

  const loading = plansLoading || statusLoading;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("subscription.yourSubscription", "Your Subscription")}
        </Text>
        <Pressable
          onPress={() => router.push("/raise-ticket")}
          style={({ pressed }) => [styles.helpBtn, pressed && styles.helpBtnPressed]}
        >
          <Text style={styles.helpBtnTxt}>{t("common.help", "Help")}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {isActive && activePlan ? (
            <Text style={styles.expiryLine}>
              {t("subscription.activePlanExpires", "Active plan expires")}{" "}
              <Text style={expiry.highlight ? styles.expiryHighlight : styles.expiryDate}>
                {expiry.text}
              </Text>
            </Text>
          ) : (
            <Text style={styles.expiryLine}>
              {t("subscription.noActivePlan", "You don't have an active plan yet")}
            </Text>
          )}

          {plan ? (
            <View style={styles.planCard}>
              {isActive ? (
                <View style={[styles.activePill, { backgroundColor: accent }]}>
                  <Text style={styles.activePillTxt}>
                    {t("subscription.activeLabel", "Active")}
                  </Text>
                </View>
              ) : null}

              <View style={styles.planTop}>
                <View style={styles.planTitleRow}>
                  <View style={[styles.eliteBadge, { backgroundColor: accent }]}>
                    <Text style={styles.eliteBadgeTxt}>
                      ★ {plan.badgeText || "ELITE"} ★
                    </Text>
                  </View>
                  <Text style={styles.planCycle}>{cycleText} Plan</Text>
                </View>
                {payPrice != null ? (
                  <View style={styles.priceCol}>
                    {listPrice != null && listPrice > payPrice ? (
                      <Text style={styles.priceStrike}>{formatRupee(listPrice)}</Text>
                    ) : null}
                    <Text style={[styles.priceMain, { color: accent }]}>
                      {formatRupee(payPrice)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.walletNote}>
                {isActive && activePlan?.autoWalletDeduction
                  ? t("subscription.walletDeductActive", {
                      amount: payPrice != null ? formatRupee(payPrice) : "—",
                      cycle: cycleText,
                      defaultValue: `${payPrice != null ? formatRupee(payPrice) : "—"} will be deducted ${cycleText} from your wallet`,
                    })
                  : t("subscription.walletDeductOffer", {
                      amount: payPrice != null ? formatRupee(payPrice) : "—",
                      cycle: cycleText,
                      defaultValue: `Subscribe for ${payPrice != null ? formatRupee(payPrice) : "—"} / ${cycleText}`,
                    })}
              </Text>

              <View style={styles.divider} />

              <Text style={styles.benefitsTitle}>{t("subscription.benefits", "Benefits")}</Text>
              {plan.benefits.map((benefit, index) => (
                <View key={`${plan.id}-b-${index}`} style={styles.benefitRow}>
                  <LinearGradient colors={["#34D399", "#059669"]} style={styles.check}>
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  </LinearGradient>
                  <Text style={styles.benefitTxt}>{benefit}</Text>
                </View>
              ))}

              {!isActive ? (
                <Pressable
                  onPress={() => setSheetOpen(true)}
                  style={({ pressed }) => [styles.subscribeBtn, pressed && { opacity: 0.92 }]}
                >
                  <LinearGradient
                    colors={["#4C1D95", accent, "#9333EA"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.subscribeGradient}
                  >
                    <Text style={styles.subscribeTxt}>
                      {plan.ctaLabel || t("subscription.payTitle", "Subscribe")}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t("subscription.noPlans", "No plans available")}</Text>
              <Text style={styles.emptySub}>
                {t(
                  "subscription.noPlansSub",
                  "Configure GMitra Max in Super Admin → Subscription Plans → Rider."
                )}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <SubscriptionBottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        plan={plan}
        onSubscribed={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: {
    backgroundColor: "#F3F4F6",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  helpBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFF",
  },
  helpBtnPressed: {
    backgroundColor: "#F9FAFB",
  },
  helpBtnTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  expiryLine: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 14,
  },
  expiryHighlight: {
    fontWeight: "700",
    color: "#7C3AED",
  },
  expiryDate: {
    fontWeight: "600",
    color: "#374151",
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E9D5FF",
    backgroundColor: "#FAF5FF",
    padding: 16,
  },
  activePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
  },
  activePillTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  planTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  planTitleRow: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eliteBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  eliteBadgeTxt: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  planCycle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  priceCol: {
    alignItems: "flex-end",
  },
  priceStrike: {
    fontSize: 13,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    fontWeight: "500",
  },
  priceMain: {
    fontSize: 22,
    fontWeight: "800",
  },
  walletNote: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 14,
  },
  benefitsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  benefitTxt: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  subscribeBtn: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  subscribeGradient: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
  },
  subscribeTxt: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  empty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  emptySub: {
    marginTop: 8,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});
