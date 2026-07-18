/**
 * GMitra Plus membership — full-screen perks hub (replaces profile alert modal).
 */

import { useCallback, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import {
  useCheckoutSubscriptionPlan,
  useCurrentSubscription,
} from "@/hooks/useCustomerSubscription";
import { formatPlanPriceLine, formatSubscriptionExpiryLabel } from "@/services/subscription.service";
import { resolveSubscriptionExpiryIso } from "@/lib/subscriptionExpiry";
import { safeRouterBack, PROFILE_TAB_FALLBACK } from "@/lib/safeRouterBack";
import { GatiMitraColors } from "@/constants/gatimitra";
import { ProfileTheme } from "@/constants/profileTheme";

const GOLD = "#F59E0B";
const GOLD_DARK = "#B45309";
const TEXT = ProfileTheme.text;
const MUTED = ProfileTheme.muted;
const PAGE_BG = ProfileTheme.pageBg;

function benefitIcon(text: string): keyof typeof Ionicons.glyphMap {
  const t = text.toLowerCase();
  if (t.includes("delivery")) return "bicycle-outline";
  if (t.includes("offer") || t.includes("discount")) return "pricetag-outline";
  if (t.includes("priority") || t.includes("peak")) return "flash-outline";
  if (t.includes("festival")) return "gift-outline";
  if (t.includes("matching") || t.includes("faster")) return "rocket-outline";
  if (t.includes("early") || t.includes("access")) return "sparkles-outline";
  return "checkmark-circle-outline";
}

function BenefitRow({ text }: { text: string }) {
  const icon = benefitIcon(text);
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIconWrap}>
        <Ionicons name={icon} size={18} color={GOLD_DARK} />
      </View>
      <AppText style={styles.benefitText}>{text}</AppText>
    </View>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useAppSafeAreaInsets();
  const { data: current, isLoading: currentLoading } = useCurrentSubscription(true);
  const { checkoutPlan, defaultPrice, hasPlans } = useCheckoutSubscriptionPlan();

  const isActive = current?.active === true;
  const planName =
    current?.plan?.planName ??
    current?.subscription?.planName ??
    checkoutPlan?.planName ??
    checkoutPlan?.name ??
    "GMitra Plus";

  const benefits = useMemo(() => {
    if (isActive) {
      return current?.plan?.benefits?.length
        ? current.plan.benefits
        : ["Your membership benefits apply automatically on eligible orders."];
    }
    return checkoutPlan?.benefits?.length
      ? checkoutPlan.benefits
      : [
          "Free delivery on eligible orders",
          "Exclusive member-only offers",
          "Priority support during peak hours",
        ];
  }, [isActive, current?.plan?.benefits, checkoutPlan?.benefits]);

  const freeDeliveryRadius = isActive
    ? current?.plan?.maxFreeDeliveryRadiusKm
    : checkoutPlan?.maxFreeDeliveryRadiusKm;

  const freeDeliveryEnabled = isActive
    ? current?.plan?.freeDeliveryEnabled
    : checkoutPlan?.freeDeliveryEnabled;

  const expiresAt = useMemo(() => {
    const label = formatSubscriptionExpiryLabel(current?.subscription?.expiresAt);
    if (label) return label;
    const iso = resolveSubscriptionExpiryIso(current?.subscription ?? null);
    return formatSubscriptionExpiryLabel(iso);
  }, [current?.subscription]);
  const billingCycle = current?.subscription?.billingCycle?.trim();

  const handleBack = useCallback(() => {
    safeRouterBack(router, PROFILE_TAB_FALLBACK);
  }, [router]);

  const handleBrowse = useCallback(() => {
    router.push("/home");
  }, [router]);

  const showRadiusBenefit =
    freeDeliveryEnabled &&
    freeDeliveryRadius != null &&
    !benefits.some((b) => b.toLowerCase().includes("delivery"));

  const handleTerms = useCallback(() => {
    router.push("/profile/legal/subscription-terms-gmitra-max" as never);
  }, [router]);

  const loading = currentLoading && !current;

  return (
    <View style={styles.screen}>
      <AndroidBackHandler fallback={PROFILE_TAB_FALLBACK} />
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <ProfileSubpageHeader title="Membership" onBack={handleBack} />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={isActive ? ["#FFFBEB", "#FEF3C7", "#FFF7ED"] : ["#F0FDF4", "#ECFDF5", "#FFFBEB"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTop}>
              <View style={styles.crownRing}>
                <MaterialCommunityIcons name="crown" size={28} color={GOLD} />
              </View>
              <View style={[styles.statusPill, isActive ? styles.statusPillActive : styles.statusPillInactive]}>
                <AppText style={[styles.statusPillText, isActive ? styles.statusPillTextActive : styles.statusPillTextInactive]}>
                  {isActive ? "Active" : "Not joined"}
                </AppText>
              </View>
            </View>

            <AppText style={styles.planTitle}>{planName}</AppText>
            <AppText style={styles.planSubtitle}>
              {isActive
                ? "Your perks are applied automatically on every eligible order."
                : checkoutPlan?.headline ??
                  checkoutPlan?.description ??
                  "Save on delivery and unlock member-only offers across GatiMitra."}
            </AppText>

            {isActive && expiresAt ? (
              <View style={styles.metaChip}>
                <Ionicons name="calendar-outline" size={14} color={GOLD_DARK} />
                <AppText style={styles.metaChipText}>Valid till {expiresAt}</AppText>
              </View>
            ) : null}

            {!isActive && defaultPrice ? (
              <View style={styles.priceChip}>
                <AppText style={styles.priceChipLabel}>Starts at</AppText>
                <AppText style={styles.priceChipValue}>{formatPlanPriceLine(defaultPrice)}</AppText>
              </View>
            ) : null}
          </LinearGradient>

          {(freeDeliveryEnabled && freeDeliveryRadius != null) || billingCycle ? (
            <View style={styles.statsRow}>
              {freeDeliveryEnabled && freeDeliveryRadius != null ? (
                <View style={styles.statCard}>
                  <Ionicons name="bicycle" size={20} color={GatiMitraColors.primaryMint} />
                  <AppText style={styles.statValue}>{freeDeliveryRadius} km</AppText>
                  <AppText style={styles.statLabel}>Free delivery radius</AppText>
                </View>
              ) : null}
              {billingCycle ? (
                <View style={styles.statCard}>
                  <Ionicons name="refresh-circle-outline" size={20} color={GOLD_DARK} />
                  <AppText style={styles.statValue}>
                    {billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}
                  </AppText>
                  <AppText style={styles.statLabel}>Billing cycle</AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          <AppText style={styles.sectionTitle}>{isActive ? "Your perks" : "What you get"}</AppText>
          <View style={styles.benefitsCard}>
            {benefits.map((benefit) => (
              <BenefitRow key={benefit} text={benefit} />
            ))}
            {showRadiusBenefit ? (
              <BenefitRow
                text={`Free delivery within ${freeDeliveryRadius} km on eligible orders`}
              />
            ) : null}
          </View>

          <View style={styles.noteCard}>
            <Ionicons name="information-circle-outline" size={18} color={MUTED} />
            <AppText style={styles.noteText}>
              {isActive
                ? "Benefits may vary by city, restaurant, and order value. Savings show up automatically at checkout."
                : hasPlans
                  ? `Add ${planName} at checkout on your next food order to start saving instantly.`
                  : "Membership plans are being rolled out in your area. Check back soon."}
            </AppText>
          </View>

          {!isActive && hasPlans ? (
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.9} onPress={handleBrowse}>
              <LinearGradient
                colors={[GatiMitraColors.primaryMint, "#059669"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.primaryBtnGradient}
              >
                <AppText style={styles.primaryBtnText}>Browse restaurants</AppText>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.termsLink} onPress={handleTerms} activeOpacity={0.8}>
            <AppText style={styles.termsLinkText}>View subscription terms</AppText>
            <Ionicons name="chevron-forward" size={16} color={GatiMitraColors.primaryMint} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  heroCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.22)",
    overflow: "hidden",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  crownRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusPillActive: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  statusPillInactive: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusPillTextActive: {
    color: "#15803D",
  },
  statusPillTextInactive: {
    color: MUTED,
  },
  planTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  planSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4B5563",
    fontWeight: "500",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: GOLD_DARK,
  },
  priceChip: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
  },
  priceChipLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  priceChipValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: MUTED,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  benefitsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: TEXT,
    paddingTop: 7,
  },
  noteCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
    fontWeight: "500",
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 4,
  },
  primaryBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  termsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
  },
  termsLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.primaryMint,
  },
});
