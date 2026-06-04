import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type RiderSubscriptionPlan,
  billingCycleLabel,
  useRiderSubscriptionPayment,
} from "@/src/hooks/useRiderSubscription";
import { formatRupeeFromPaise } from "@/src/hooks/useOnboardingFeeConfig";

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
}: {
  planName: string;
  headline: string;
  badgeText: string;
  featured: RiderSubscriptionPlan["featuredPrice"];
  inclGstLabel: string;
}) {
  return (
    <LinearGradient
      colors={["#12032E", "#2E1065", "#4C1D95"]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.hero}
    >
      <View style={styles.heroRay} />
      <View style={styles.heroGoldStripe} />

      <View style={styles.heroRow}>
        <View style={styles.emblemWrap}>
          <View style={styles.emblemGlow} />
          <View style={styles.shieldOuter}>
            <LinearGradient colors={["#1E0A45", "#12032E"]} style={styles.shieldInner}>
              <MaterialCommunityIcons name="diamond-stone" size={22} color="#E9D5FF" />
            </LinearGradient>
          </View>
          <View style={styles.crownTop}>
            <MaterialCommunityIcons name="crown" size={26} color="#FBBF24" />
          </View>
        </View>

        <View style={styles.heroCopy}>
          <Text style={styles.planTitle} numberOfLines={1}>
            {planName}
          </Text>
          <Text style={styles.tagline} numberOfLines={2}>
            {headline}
          </Text>
          {featured ? (
            <View style={styles.priceChip}>
              <Text style={styles.priceChipText}>
                {formatRupee(featured.total)} / {featured.cycleLabel} · {inclGstLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.ribbonWrap}>
          <LinearGradient
            colors={["#FEF3C7", "#FBBF24", "#F59E0B"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.ribbon}
          >
            <MaterialCommunityIcons name="crown" size={15} color="#1F1147" />
            <Text style={styles.ribbonText}>
              {badgeText.trim().split(/\s+/).join("\n")}
            </Text>
          </LinearGradient>
          <View style={styles.ribbonNotch} />
        </View>
      </View>
    </LinearGradient>
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
  const sheetBottomPad = Math.max(safeBottom, Platform.OS === "android" ? 12 : 8) + 12;
  const { createOrder, verifyPayment } = useRiderSubscriptionPayment();
  const [loading, setLoading] = useState(false);

  if (!plan) return null;

  const accent = plan.badgeColor || "#7C3AED";
  const featured = plan.featuredPrice;
  const cycleLabel = featured ? billingCycleLabel(featured.billingCycle) : "Monthly";

  const handleSubscribe = async () => {
    if (!plan || loading) return;
    setLoading(true);

    try {
      const order = await createOrder.mutateAsync({ planId: plan.id });

      if (order.skipPayment) {
        onSubscribed?.();
        onClose();
        return;
      }

      if (__DEV__) {
        Alert.alert(
          t("subscription.payTitle", "Subscribe"),
          t(
            "subscription.payDevMessage",
            "Pay {{amount}} for {{plan}} ({{cycle}}, incl. GST). In production this opens Razorpay checkout.",
            {
              amount: formatRupeeFromPaise(order.amount),
              plan: plan.planName,
              cycle: cycleLabel,
            }
          ),
          [
            { text: t("common.cancel", "Cancel"), style: "cancel", onPress: () => setLoading(false) },
            {
              text: t("subscription.simulatePay", "Simulate Payment"),
              onPress: async () => {
                try {
                  await verifyPayment.mutateAsync({
                    planId: plan.id,
                    razorpayOrderId: order.orderId,
                    razorpayPaymentId: `pay_${Date.now()}`,
                    razorpaySignature: "simulated_signature",
                  });
                  onSubscribed?.();
                  onClose();
                } catch (e) {
                  Alert.alert(
                    t("common.error", "Error"),
                    e instanceof Error ? e.message : t("subscription.failed", "Subscription failed")
                  );
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
        return;
      }

      Alert.alert(
        t("common.error", "Error"),
        t("subscription.razorpaySoon", "Razorpay checkout will open here in production builds.")
      );
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        e instanceof Error ? e.message : t("subscription.failed", "Subscription failed")
      );
    } finally {
      if (!__DEV__) setLoading(false);
    }
  };

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onClose}
      maxHeightRatio={0.78}
      sheetBottomPadding={sheetBottomPad}
      sheetStyle={styles.sheet}
    >
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <SubscriptionHeroHeader
          planName={plan.planName}
          headline={plan.headline || plan.tagline}
          badgeText={plan.badgeText}
          featured={featured}
          inclGstLabel={t("subscription.inclGst", "incl. GST")}
        />

        <View style={styles.body}>
          <View style={styles.benefitsCard}>
            {plan.benefits.map((benefit, index) => (
              <View key={`${plan.id}-benefit-${index}`} style={styles.benefitRow}>
                <LinearGradient colors={["#34D399", "#059669"]} style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>

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
                <Text style={styles.ctaText}>
                  {plan.ctaLabel}
                  {featured ? ` · ${formatRupee(featured.total)}` : ""}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>
    </DismissibleBottomSheetShell>
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
  hero: {
    paddingHorizontal: 14 + G,
    paddingTop: 10 + G,
    paddingBottom: 14 + G,
    overflow: "hidden",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
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
  },
  planTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    marginBottom: 2 + G,
  },
  tagline: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FBBF24",
    lineHeight: 18 + G,
    marginBottom: 8 + G,
  },
  priceChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10 + G,
    paddingVertical: 5 + G,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  priceChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ribbonWrap: {
    alignItems: "center",
    marginTop: -2,
    marginRight: -2,
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
  body: {
    paddingHorizontal: 20 + G,
    paddingTop: 14 + G,
    paddingBottom: 0,
  },
  benefitsCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 12 + G,
    gap: 8 + G,
    marginBottom: 14 + G,
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
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    lineHeight: 19 + G,
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
  },
  ctaText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
