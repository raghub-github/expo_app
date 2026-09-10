import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type RiderSubscriptionPlan,
  useRiderSubscriptionWallet,
} from "@/src/hooks/useRiderSubscription";
import { extractApiErrorMessage } from "@/src/services/http";
import { responsiveFont, responsiveSpacing } from "@/src/theme/responsive";

type SubscriptionBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  plan: RiderSubscriptionPlan | null;
  onSubscribed?: () => void;
};

function formatRupee(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function SubscriptionHeroHeader({
  planName,
  headline,
  badgeText,
  featured,
  inclGstLabel,
  compact,
}: {
  planName: string;
  headline: string;
  badgeText: string;
  featured: RiderSubscriptionPlan["featuredPrice"];
  inclGstLabel: string;
  compact?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const titleSize = responsiveFont(compact ? 18 : 22, width, fontScale, { min: 16, max: 24 });
  const tagSize = responsiveFont(13, width, fontScale, { min: 11, max: 15 });
  const priceSize = responsiveFont(12, width, fontScale, { min: 11, max: 14 });

  return (
    <LinearGradient
      colors={["#12032E", "#2E1065", "#4C1D95"]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.hero, compact && styles.heroCompact]}
    >
      <View style={styles.heroRay} />
      <View style={styles.heroGoldStripe} />

      <View style={styles.heroRow}>
        <View style={[styles.emblemWrap, compact && styles.emblemCompact]}>
          <View style={styles.emblemGlow} />
          <View style={[styles.shieldOuter, compact && styles.shieldCompact]}>
            <LinearGradient colors={["#1E0A45", "#12032E"]} style={styles.shieldInner}>
              <MaterialCommunityIcons name="diamond-stone" size={compact ? 18 : 22} color="#E9D5FF" />
            </LinearGradient>
          </View>
          <View style={styles.crownTop}>
            <MaterialCommunityIcons name="crown" size={compact ? 22 : 26} color="#FBBF24" />
          </View>
        </View>

        <View style={styles.heroCopy}>
          <Text style={[styles.planTitle, { fontSize: titleSize }]} numberOfLines={1}>
            {planName}
          </Text>
          <Text style={[styles.tagline, { fontSize: tagSize }]} numberOfLines={2}>
            {headline}
          </Text>
          {featured ? (
            <View style={styles.priceChip}>
              <Text style={[styles.priceChipText, { fontSize: priceSize }]} numberOfLines={1}>
                {formatRupee(featured.total)} / {featured.cycleLabel} · {inclGstLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {!compact ? (
          <View style={styles.ribbonWrap}>
            <LinearGradient
              colors={["#FEF3C7", "#FBBF24", "#F59E0B"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.ribbon}
            >
              <MaterialCommunityIcons name="crown" size={15} color="#1F1147" />
              <Text style={styles.ribbonText} numberOfLines={2}>
                {badgeText.trim().split(/\s+/).join("\n")}
              </Text>
            </LinearGradient>
            <View style={styles.ribbonNotch} />
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

function SuccessOverlay({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.successBackdrop}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark" size={42} color="#FFFFFF" />
          </View>
          <Text style={styles.successTitle} numberOfLines={3}>
            {t("subscription.successTitle", "You are a Pro member now !")}
          </Text>
          <Pressable onPress={onDismiss} style={styles.successBtn}>
            <Text style={styles.successBtnTxt}>{t("subscription.successCta", "Great, thanks")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function SubscriptionBottomSheet({
  visible,
  onClose,
  plan,
  onSubscribed,
}: SubscriptionBottomSheetProps) {
  const { t } = useTranslation();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { height: winH, width: winW, fontScale } = useWindowDimensions();
  const isShort = winH < 700;
  const sheetBottomPad = Math.max(safeBottom, Platform.OS === "android" ? 12 : 8) + 8;
  const { subscribeWallet } = useRiderSubscriptionWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      setError(null);
      setShowSuccess(false);
    }
  }, [visible, plan?.id]);

  if (!plan) return null;

  const accent = plan.badgeColor || "#7C3AED";
  const featured = plan.featuredPrice;
  const benefitSize = responsiveFont(14, winW, fontScale, { min: 12, max: 16 });
  const bodyPad = responsiveSpacing(20, winW);
  const maxHeightRatio = isShort ? 0.92 : 0.78;
  /** Bound the column so ScrollView + sticky footer layout correctly under maxHeight sheets. */
  const contentMaxHeight = Math.round(winH * maxHeightRatio) - sheetBottomPad - 24;

  const handleSubscribe = async () => {
    if (!plan || loading) return;
    setLoading(true);
    setError(null);

    try {
      await subscribeWallet.mutateAsync({
        planId: plan.id,
        billingCycle: featured?.billingCycle,
        autoWalletDeduction: true,
      });
      setShowSuccess(true);
    } catch (e) {
      setError(
        extractApiErrorMessage(e, t("subscription.failed", "Subscription failed"))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessDismiss = () => {
    setShowSuccess(false);
    onSubscribed?.();
    onClose();
  };

  return (
    <>
      <DismissibleBottomSheetShell
        visible={visible}
        onDismiss={onClose}
        maxHeightRatio={maxHeightRatio}
        sheetBottomPadding={sheetBottomPad}
        sheetStyle={styles.sheet}
      >
        <View style={[styles.column, { maxHeight: contentMaxHeight }]}>
          <SubscriptionHeroHeader
            planName={plan.planName}
            headline={plan.headline || plan.tagline}
            badgeText={plan.badgeText}
            featured={featured}
            inclGstLabel={t("subscription.inclGst", "incl. GST")}
            compact={isShort}
          />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: bodyPad }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.benefitsCard}>
              {plan.benefits.map((benefit, index) => (
                <View key={`${plan.id}-benefit-${index}`} style={styles.benefitRow}>
                  <LinearGradient colors={["#34D399", "#059669"]} style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={12} color="#ffffff" />
                  </LinearGradient>
                  <Text
                    style={[styles.benefitText, { fontSize: benefitSize }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {benefit}
                  </Text>
                </View>
              ))}
            </View>

            {error ? <Text style={styles.errorTxt}>{error}</Text> : null}
          </ScrollView>

          <View style={[styles.footer, { paddingHorizontal: bodyPad }]}>
            <Pressable
              onPress={handleSubscribe}
              disabled={loading}
              style={({ pressed }) => [styles.ctaWrap, pressed && { opacity: 0.94 }]}
            >
              <LinearGradient
                colors={["#4C1D95", accent, "#C084FC"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.cta}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.ctaText} numberOfLines={1} ellipsizeMode="tail">
                    {plan.ctaLabel}
                    {featured ? ` · ${formatRupee(featured.total)}` : ""}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.walletHint} numberOfLines={2}>
              {t(
                "subscription.walletPayHint",
                "Amount will be deducted from your rider wallet instantly."
              )}
            </Text>
          </View>
        </View>
      </DismissibleBottomSheetShell>

      <SuccessOverlay visible={showSuccess} onDismiss={handleSuccessDismiss} />
    </>
  );
}

const G = 0.5;

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 0,
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  column: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    maxHeight: "100%",
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: 14 + G,
    paddingBottom: 8,
    flexGrow: 1,
  },
  footer: {
    flexShrink: 0,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  hero: {
    paddingHorizontal: 14 + G,
    paddingTop: 10 + G,
    paddingBottom: 14 + G,
    overflow: "hidden",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    flexShrink: 0,
  },
  heroCompact: {
    paddingTop: 8,
    paddingBottom: 10,
  },
  heroRay: {
    position: "absolute",
    left: -20,
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(251,191,36,0.22)",
  },
  heroGoldStripe: {
    position: "absolute",
    right: -30,
    top: -40,
    width: 90,
    height: 160,
    backgroundColor: "rgba(251,191,36,0.18)",
    transform: [{ rotate: "24deg" }],
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10 + G,
  },
  emblemWrap: {
    width: 62,
    height: 72,
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4 + G,
    flexShrink: 0,
  },
  emblemCompact: {
    width: 52,
    height: 60,
  },
  emblemGlow: {
    position: "absolute",
    bottom: 8,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(253,224,71,0.35)",
  },
  shieldOuter: {
    width: 48,
    height: 54,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderWidth: 2.5,
    borderColor: "#FBBF24",
    overflow: "hidden",
  },
  shieldCompact: {
    width: 40,
    height: 46,
  },
  shieldInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  crownTop: {
    position: "absolute",
    top: -2,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    paddingTop: 6 + G,
    minWidth: 0,
    flexShrink: 1,
  },
  planTitle: {
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    marginBottom: 2 + G,
  },
  tagline: {
    fontWeight: "600",
    color: "#FBBF24",
    lineHeight: 18 + G,
    marginBottom: 8 + G,
  },
  priceChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10 + G,
    paddingVertical: 5 + G,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  priceChipText: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ribbonWrap: {
    alignItems: "center",
    marginTop: -2,
    marginRight: -2,
    flexShrink: 0,
  },
  ribbon: {
    width: 52,
    paddingTop: 8 + G,
    paddingBottom: 6 + G,
    paddingHorizontal: 4 + G,
    alignItems: "center",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    gap: 2 + G,
  },
  ribbonText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1F1147",
    textAlign: "center",
    lineHeight: 11 + G,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  ribbonNotch: {
    width: 0,
    height: 0,
    borderLeftWidth: 26,
    borderRightWidth: 26,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F59E0B",
    marginTop: -1,
  },
  benefitsCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 12 + G,
    gap: 8 + G,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10 + G,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  benefitText: {
    flex: 1,
    minWidth: 0,
    fontWeight: "600",
    color: "#1F2937",
    lineHeight: 19 + G,
  },
  errorTxt: {
    marginTop: 10,
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "600",
  },
  ctaWrap: {
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#6D28D9",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  cta: {
    paddingVertical: 14 + G,
    paddingHorizontal: 16 + G,
    borderRadius: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  walletHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 2,
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
    minHeight: 44,
    justifyContent: "center",
  },
  successBtnTxt: {
    fontSize: 15,
    fontWeight: "700",
    color: "#7C3AED",
  },
});
