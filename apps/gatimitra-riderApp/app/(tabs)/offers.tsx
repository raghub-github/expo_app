import React, { useState } from "react";
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
import { colors } from "@/src/theme";
import { SubscriptionBottomSheet } from "@/src/components/subscription/SubscriptionBottomSheet";
import {
  pickFeaturedPlan,
  useRiderSubscriptionPlans,
  useRiderSubscriptionStatus,
} from "@/src/hooks/useRiderSubscription";

export default function OffersScreen() {
  const { t } = useTranslation();
  const { data: plans = [], isLoading } = useRiderSubscriptionPlans();
  const { data: status } = useRiderSubscriptionStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  const featured = pickFeaturedPlan(plans);
  const isSubscribed = Boolean(status?.active);
  const badgeColor = featured?.badgeColor ?? "#7C3AED";

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.pad}>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary[500]} />
            </View>
          ) : featured ? (
            <Pressable onPress={() => !isSubscribed && setSheetOpen(true)} disabled={isSubscribed}>
              <LinearGradient
                colors={isSubscribed ? ["#ECFDF5", "#D1FAE5"] : [badgeColor, "#9333EA"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.membershipCard}
              >
                <View style={styles.membershipTop}>
                  <View style={[styles.membershipBadge, isSubscribed && styles.membershipBadgeActive]}>
                    <Text style={[styles.membershipBadgeText, isSubscribed && styles.membershipBadgeTextActive]}>
                      {isSubscribed ? t("subscription.activePlan", "ACTIVE") : `★ ${featured.badgeText} ★`}
                    </Text>
                  </View>
                  {!isSubscribed ? (
                    <Ionicons name="chevron-forward" size={20} color="#ffffff" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={22} color={colors.success[600]} />
                  )}
                </View>
                <Text style={[styles.membershipHeadline, isSubscribed && styles.membershipHeadlineActive]}>
                  {isSubscribed ? status?.plan?.planName ?? featured.planName : featured.planName}
                </Text>
                <Text style={[styles.membershipSub, isSubscribed && styles.membershipSubActive]}>
                  {isSubscribed
                    ? t("subscription.enjoyBenefits", "You are enjoying membership benefits")
                    : `🚀 ${featured.headline}`}
                </Text>
                {!isSubscribed && featured.benefits.length ? (
                  <Text style={styles.benefitPreview}>✓ {featured.benefits[0]}</Text>
                ) : null}
                {!isSubscribed ? (
                  <View style={styles.membershipCta}>
                    <Text style={styles.membershipCtaText}>{featured.ctaLabel}</Text>
                  </View>
                ) : null}
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>{t("subscription.noPlans", "No plans available")}</Text>
              <Text style={styles.emptySub}>
                {t("subscription.noPlansSub", "Configure GMitra Max in Super Admin → Subscription Plans → Rider.")}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>{t("offers.activeOffers", "Active Offers")}</Text>
          <View style={styles.comingSoon}>
            <Ionicons name="gift-outline" size={28} color={colors.gray[400]} />
            <Text style={styles.comingSoonText}>
              {t("offers.promosComingSoon", "Bonus offers & challenges coming soon")}
            </Text>
          </View>
        </View>
      </ScrollView>

      <SubscriptionBottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        plan={featured}
        onSubscribed={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  pad: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  loadingBox: { paddingVertical: 40, alignItems: "center" },
  membershipCard: { borderRadius: 18, padding: 18, marginBottom: 24, overflow: "hidden" },
  membershipTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  membershipBadge: { backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  membershipBadgeActive: { backgroundColor: "#ffffff" },
  membershipBadgeText: { color: "#FBBF24", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  membershipBadgeTextActive: { color: colors.success[700] },
  membershipHeadline: { fontSize: 24, fontWeight: "800", color: "#ffffff", marginBottom: 6 },
  membershipHeadlineActive: { color: "#065F46" },
  membershipSub: { fontSize: 14, color: "rgba(255,255,255,0.92)", lineHeight: 20 },
  membershipSubActive: { color: "#047857" },
  benefitPreview: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 8 },
  membershipCta: { marginTop: 14, alignSelf: "flex-start", backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  membershipCtaText: { color: "#5B21B6", fontWeight: "800", fontSize: 13 },
  emptyBox: { backgroundColor: "#ffffff", borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: "#E5E7EB" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 },
  emptySub: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 12 },
  comingSoon: { backgroundColor: "#ffffff", borderRadius: 14, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", gap: 8 },
  comingSoonText: { fontSize: 14, color: "#6B7280", textAlign: "center" },
});
