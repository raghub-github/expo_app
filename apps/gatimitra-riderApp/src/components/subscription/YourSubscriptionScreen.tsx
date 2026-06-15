import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { SubscriptionTermsBottomSheet } from "@/src/components/subscription/SubscriptionTermsBottomSheet";
import { SubscriptionDuesBanner } from "@/src/components/subscription/SubscriptionDuesBanner";
import { useQueryClient } from "@tanstack/react-query";
import {
  billingCycleLabel,
  pickFeaturedPlan,
  useRiderSubscriptionPlans,
  useRiderSubscriptionStatus,
  useRiderSubscriptionWallet,
  type RiderSubscriptionPlan,
  type BillingCycle,
} from "@/src/hooks/useRiderSubscription";
import { extractApiErrorMessage } from "@/src/services/http";

function formatRupee(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function formatMaxBadge(badgeText?: string | null): string {
  const raw = badgeText?.trim();
  if (raw) {
    const normalized = raw.replace(/elite/gi, "MAX");
    return normalized.includes("★") ? normalized : `★ ${normalized} ★`;
  }
  return "★ MAX ★";
}

function resolveSubscriptionDates(
  activePlan: NonNullable<ReturnType<typeof useRiderSubscriptionStatus>["data"]>["plan"]
): { expiryIso: string | null; renewalIso: string | null } {
  if (!activePlan) return { expiryIso: null, renewalIso: null };

  const expiryIso = activePlan.expiryDate?.trim() || null;
  const renewalIso = activePlan.nextRenewalDate?.trim() || null;

  return {
    expiryIso: expiryIso && !Number.isNaN(new Date(expiryIso).getTime()) ? expiryIso : null,
    renewalIso: renewalIso && !Number.isNaN(new Date(renewalIso).getTime()) ? renewalIso : null,
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
  const queryClient = useQueryClient();
  const { data: plans = [], isLoading: plansLoading } = useRiderSubscriptionPlans();
  const { data: status, isLoading: statusLoading } = useRiderSubscriptionStatus();
  const { setAutoRenewal, subscribeWallet } = useRiderSubscriptionWallet();
  const [termsOpen, setTermsOpen] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isActive = Boolean(status?.active);
  const activePlan = status?.plan;
  const dues = status?.dues;
  const plan = useMemo(
    () => resolvePlan(plans, activePlan?.planId),
    [plans, activePlan?.planId]
  );

  const featured = plan?.featuredPrice;
  const cycle = (activePlan?.billingCycle ?? featured?.billingCycle ?? "monthly") as BillingCycle;
  const cycleText = billingCycleLabel(cycle);
  const cycleLower = cycleText.toLowerCase();
  const accent = plan?.badgeColor ?? "#7C3AED";
  const planBrandName = activePlan?.planName || plan?.planName || "Gatimitra Max";
  const maxBadgeLabel = formatMaxBadge(plan?.badgeText);

  const { expiryIso, renewalIso } = useMemo(
    () => resolveSubscriptionDates(activePlan ?? null),
    [activePlan]
  );

  const listPrice = featured ? Math.round(featured.total * 11) : null;
  const payPrice = featured?.total ?? null;

  const loading = plansLoading || statusLoading;
  const autoRenewOn = Boolean(activePlan?.autoWalletDeduction);

  const handleAutoRenewToggle = async (enabled: boolean) => {
    if (!isActive || toggleBusy) return;
    setToggleBusy(true);
    try {
      await setAutoRenewal.mutateAsync(enabled);
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        extractApiErrorMessage(e, t("subscription.autoRenewFailed", "Could not update auto-renewal"))
      );
    } finally {
      setToggleBusy(false);
    }
  };

  const handleSubscribe = async () => {
    if (!plan || subscribing || isActive) return;
    setSubscribing(true);
    try {
      await subscribeWallet.mutateAsync({
        planId: plan.id,
        billingCycle: featured?.billingCycle,
        autoWalletDeduction: true,
      });
      setShowSuccess(true);
      void queryClient.invalidateQueries({ queryKey: ["rider", "subscription", "status"] });
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        extractApiErrorMessage(e, t("subscription.failed", "Subscription failed"))
      );
    } finally {
      setSubscribing(false);
    }
  };

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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t("subscription.yourSubscription", "Your Subscription")}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setTermsOpen(true)}
            style={({ pressed }) => [styles.tcBtn, pressed && styles.headerBtnPressed]}
          >
            <Text style={styles.tcBtnTxt}>{t("subscription.termsShort", "T&C")}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/raise-ticket")}
            style={({ pressed }) => [styles.helpBtn, pressed && styles.headerBtnPressed]}
          >
            <Text style={styles.helpBtnTxt}>{t("common.help", "Help")}</Text>
          </Pressable>
        </View>
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
          {(dues?.alertBanner?.visible ?? ((dues?.dispatchBlocked || (dues?.totalDue ?? 0) > 0) && isActive)) ? (
            <View style={styles.duesBannerWrap}>
              <SubscriptionDuesBanner />
            </View>
          ) : null}

          {plan ? (
            <View style={[styles.planCardWrap, isActive && styles.planCardWrapActive]}>
              {isActive ? (
                <View style={[styles.activePill, { backgroundColor: accent }]}>
                  <Text style={styles.activePillTxt}>
                    {t("subscription.activeLabel", "Active")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.planCard, isActive && styles.planCardActive]}>
                <View style={styles.planTop}>
                  <View style={styles.planTitleRow}>
                    <View style={styles.planTitleLine}>
                      <View style={styles.maxBadge}>
                        <Text style={styles.maxBadgeTxt}>{maxBadgeLabel}</Text>
                      </View>
                      <Text style={styles.planCycle}>{cycleText} Plan</Text>
                    </View>
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
                  {isActive && autoRenewOn
                    ? t("subscription.gatimitraWalletDeductActive", {
                        amount: payPrice != null ? formatRupee(payPrice) : "—",
                        cycle: cycleLower,
                        defaultValue: `${payPrice != null ? formatRupee(payPrice) : "—"} will be deducted ${cycleLower} from your wallet`,
                      })
                    : t("subscription.gatimitraWalletDeductOffer", {
                        amount: payPrice != null ? formatRupee(payPrice) : "—",
                        cycle: cycleLower,
                        plan: planBrandName,
                        defaultValue: `Join ${planBrandName} — ${payPrice != null ? formatRupee(payPrice) : "—"} / ${cycleText}`,
                      })}
                </Text>

                {isActive && activePlan ? (
                  <View style={styles.datesInCard}>
                    <View style={styles.dateInCardItem}>
                      <Text style={styles.dateInCardLabel}>
                        {t("subscription.expiresOn", "Expires on")}
                      </Text>
                      <Text style={styles.dateInCardValue}>{formatDateTime(expiryIso)}</Text>
                    </View>
                    <View style={styles.dateInCardDivider} />
                    <View style={styles.dateInCardItem}>
                      <Text style={styles.dateInCardLabel}>
                        {t("subscription.nextRenewal", "Next renewal")}
                      </Text>
                      <Text style={[styles.dateInCardValue, { color: accent }]}>
                        {formatDateTime(renewalIso)}
                      </Text>
                    </View>
                  </View>
                ) : null}

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

                {isActive ? (
                  <View style={styles.autoRenewBox}>
                    <View style={styles.autoRenewRow}>
                      <View style={styles.autoRenewCopy}>
                        <Text style={styles.autoRenewTitle}>
                          {autoRenewOn
                            ? t("subscription.autoRenewActive", "Auto renew is active")
                            : t("subscription.autoRenewOff", "Auto renew is off")}
                        </Text>
                        <Text style={styles.autoRenewSub}>
                          {autoRenewOn
                            ? t(
                                "subscription.gatimitraAutoRenewSub",
                                "Your Gatimitra Max plan auto-renews {{cycle}}. The fee is deducted from your wallet balance.",
                                { cycle: cycleLower }
                              )
                            : t(
                                "subscription.autoRenewOffSub",
                                "Turn on to renew Gatimitra Max automatically from your wallet each billing cycle."
                              )}
                        </Text>
                      </View>
                      <Switch
                        value={autoRenewOn}
                        onValueChange={handleAutoRenewToggle}
                        disabled={toggleBusy}
                        trackColor={{ false: "#D1D5DB", true: "#C4B5FD" }}
                        thumbColor={autoRenewOn ? accent : "#F9FAFB"}
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <Pressable
                      onPress={handleSubscribe}
                      disabled={subscribing}
                      style={({ pressed }) => [styles.subscribeBtn, pressed && { opacity: 0.92 }]}
                    >
                      <LinearGradient
                        colors={["#4C1D95", accent, "#9333EA"]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={styles.subscribeGradient}
                      >
                        {subscribing ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.subscribeTxt}>
                            {t("subscription.becomeMaxRider", "Become a Max Rider")}
                          </Text>
                        )}
                      </LinearGradient>
                    </Pressable>
                    <Text style={styles.walletHint}>
                      {t(
                        "subscription.walletPayHint",
                        "Amount will be deducted from your rider wallet instantly."
                      )}
                    </Text>
                  </>
                )}
              </View>
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

      <SubscriptionTermsBottomSheet visible={termsOpen} onClose={() => setTermsOpen(false)} />

      <Modal visible={showSuccess} transparent animationType="fade" onRequestClose={() => setShowSuccess(false)}>
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={42} color="#FFFFFF" />
            </View>
            <Text style={styles.successTitle}>
              {t("subscription.maxRiderSuccessTitle", "You are a Max Rider now !")}
            </Text>
            <Pressable
              onPress={() => {
                setShowSuccess(false);
                void queryClient.invalidateQueries({ queryKey: ["rider", "subscription", "status"] });
              }}
              style={styles.successBtn}
            >
              <Text style={styles.successBtnTxt}>{t("subscription.successCta", "Great, thanks")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    paddingLeft: 12,
    paddingRight: 16,
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
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingLeft: 4,
  },
  tcBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C4B5FD",
    backgroundColor: "#FFFFFF",
  },
  helpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  headerBtnPressed: {
    opacity: 0.75,
  },
  tcBtnTxt: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6D28D9",
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
    gap: 16,
  },
  duesBannerWrap: {
    marginHorizontal: -16,
  },
  planCardWrap: {
    position: "relative",
  },
  planCardWrapActive: {
    marginTop: 6,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E9D5FF",
    backgroundColor: "#FAF5FF",
    padding: 16,
  },
  planCardActive: {
    paddingTop: 20,
  },
  activePill: {
    position: "absolute",
    top: -11,
    right: 16,
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
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
  },
  planTitleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  maxBadge: {
    backgroundColor: "#312E81",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  maxBadgeTxt: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  planCycle: {
    fontSize: 17,
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
    fontSize: 24,
    fontWeight: "800",
  },
  walletNote: {
    marginTop: 10,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  datesInCard: {
    marginTop: 12,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    overflow: "hidden",
  },
  dateInCardItem: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dateInCardDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  dateInCardLabel: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  dateInCardValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 16,
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
  autoRenewBox: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
  },
  autoRenewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  autoRenewCopy: {
    flex: 1,
    minWidth: 0,
  },
  autoRenewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  autoRenewSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
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
  walletHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 17,
  },
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  successBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  successBtnTxt: {
    fontSize: 15,
    fontWeight: "700",
    color: "#7C3AED",
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
