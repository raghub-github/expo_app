import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Platform, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/src/theme";
import {
  parseFoodDeliverySuccessParams,
  type FoodDeliverySuccessParams,
} from "@/src/lib/food-delivery-success-nav";
import { formatDistanceKm } from "@/src/lib/incoming-order-display";

type Props = {
  params: Record<string, string | string[] | undefined>;
};

const CONFETTI_DOTS = [
  { top: 8, left: 24, color: "#F59E0B" },
  { top: 20, right: 32, color: "#3B82F6" },
  { top: 4, right: 72, color: "#EC4899" },
  { top: 36, left: 64, color: "#8B5CF6" },
  { top: 52, right: 48, color: "#10B981" },
] as const;

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={colors.success[700]} />
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function FoodDeliverySuccessScreen({ params: rawParams }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params: FoodDeliverySuccessParams = parseFoodDeliverySuccessParams(rawParams);
  const scrollBottomPad = Math.max(insets.bottom, 12) + 16;
  const kindRaw = rawParams.kind;
  const isRide =
    (typeof kindRaw === "string" ? kindRaw : Array.isArray(kindRaw) ? kindRaw[0] : "") === "ride";

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const cardY = useSharedValue(24);
  const navigatedRef = useRef(false);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 400 });
    cardY.value = withDelay(120, withSpring(0, { damping: 14, stiffness: 120 }));
  }, [scale, opacity, cardY]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  const totalEarning = Number(params.totalEarning) || 0;
  const baseEarning = Number(params.baseEarning) || 0;
  const tipAmount = Number(params.tipAmount) || 0;
  const tripMinutes = Number(params.tripMinutes) || 0;
  const distanceLabel = params.distanceKm
    ? formatDistanceKm(Number(params.distanceKm))
    : "—";

  const handleGoHome = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace("/(tabs)/orders");
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={["#ECFDF5", "#F0FDF4", "#FFFFFF"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Pressable
            onPress={() => router.push("/raise-ticket")}
            style={({ pressed }) => [styles.helpBtn, pressed && styles.helpBtnPressed]}
            hitSlop={8}
          >
            <Ionicons name="help-circle-outline" size={18} color={colors.gray[700]} />
            <Text style={styles.helpText}>{t("common.help", "Help")}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomPad, minHeight: "100%" },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.mainContent}>
          <Animated.View style={[styles.hero, heroStyle]}>
            <View style={styles.checkWrap}>
              {CONFETTI_DOTS.map((dot, i) => (
                <View
                  key={i}
                  style={[
                    styles.confettiDot,
                    {
                      backgroundColor: dot.color,
                      top: dot.top,
                      left: "left" in dot ? dot.left : undefined,
                      right: "right" in dot ? dot.right : undefined,
                    },
                  ]}
                />
              ))}
              <Ionicons name="checkmark-circle" size={88} color={colors.success[600]} />
            </View>
            <Text style={styles.title}>
              {isRide
                ? t("orders.rideSuccess.title", "Ride completed!")
                : t("orders.deliverySuccess.title", "Order delivered!")}
            </Text>
            <Text style={styles.subtitle}>
              {isRide
                ? t(
                    "orders.rideSuccess.subtitle",
                    "Great job — the passenger has reached their destination."
                  )
                : t(
                    "orders.deliverySuccess.subtitle",
                    "Great job — the customer has received their order."
                  )}
            </Text>
          </Animated.View>

          <Animated.View style={[styles.card, cardStyle]}>
            <View style={styles.orderRow}>
              <Text style={styles.orderLabel}>
                {t("orders.deliverySuccess.orderIdLabel", "Order ID")}
              </Text>
              <Text style={styles.orderId}>#{params.displayId}</Text>
            </View>

            {params.merchantName ? (
              <View style={styles.metaRow}>
                <Ionicons name="storefront-outline" size={16} color={colors.success[600]} />
                <Text style={styles.metaText} numberOfLines={2}>
                  {params.merchantName}
                </Text>
              </View>
            ) : null}

            {params.customerName ? (
              <View style={styles.metaRow}>
                <Ionicons name="person-outline" size={16} color={colors.success[600]} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {params.customerName}
                </Text>
              </View>
            ) : null}

            <View style={styles.earningBlock}>
              <Text style={styles.earningLabel}>
                {t("orders.deliverySuccess.youEarned", "You earned")}
              </Text>
              <Text style={styles.earningAmount}>
                ₹{totalEarning.toLocaleString("en-IN")}
              </Text>
              <View style={styles.earningBreakdown}>
                <View style={styles.earningLine}>
                  <Text style={styles.earningSub}>
                    {t("orders.deliverySuccess.deliveryFee", "Delivery fee")}
                  </Text>
                  <Text style={styles.earningSubVal}>
                    ₹{baseEarning.toLocaleString("en-IN")}
                  </Text>
                </View>
                {tipAmount > 0 ? (
                  <View style={styles.earningLine}>
                    <Text style={styles.earningSub}>
                      {t("orders.deliverySuccess.tip", "Customer tip")}
                    </Text>
                    <Text style={[styles.earningSubVal, styles.tipVal]}>
                      + ₹{tipAmount.toLocaleString("en-IN")}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.feedbackBanner}>
              <Ionicons name="ribbon" size={18} color={colors.success[700]} />
              <Text style={styles.feedbackText}>
                {t(
                  "orders.deliverySuccess.feedback",
                  "Great delivery! Awesome work! Keep it up."
                )}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
            </View>

            <View style={styles.statsRow}>
              <StatCard
                icon="time-outline"
                label={t("orders.deliverySuccess.tripTime", "Trip time")}
                value={tripMinutes > 0 ? `${tripMinutes} min` : "—"}
              />
              <StatCard
                icon="navigate-outline"
                label={t("orders.deliverySuccess.distance", "Distance")}
                value={distanceLabel}
              />
            </View>
          </Animated.View>

          <View style={styles.walletBanner}>
            <View style={styles.walletIconWrap}>
              <Ionicons name="wallet" size={20} color="#1D4ED8" />
            </View>
            <Text style={styles.walletText}>
              {t(
                "orders.deliverySuccess.walletNote",
                "Your earnings will be added to your wallet shortly."
              )}
            </Text>
          </View>
          </View>

          <View style={styles.ctaWrap}>
            <Pressable
              onPress={handleGoHome}
              style={({ pressed }) => [styles.homeBtn, pressed && styles.homeBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t("orders.deliverySuccess.goToHome", "Go to home")}
            >
              <Ionicons name="home-outline" size={22} color="#ffffff" style={styles.homeBtnIcon} />
              <Text style={styles.homeBtnLabel}>
                {t("orders.deliverySuccess.goToHome", "Go to Home")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  topBarSpacer: { flex: 1 },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  helpBtnPressed: { opacity: 0.85 },
  helpText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[700],
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
  },
  mainContent: {
    flexGrow: 1,
  },
  ctaWrap: {
    marginTop: 20,
    paddingTop: 4,
  },
  hero: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 12,
  },
  checkWrap: {
    position: "relative",
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    width: 120,
    height: 100,
    ...Platform.select({
      ios: {
        shadowColor: colors.success[600],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  confettiDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[100],
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: { elevation: 4 },
    }),
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  orderLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
  },
  orderId: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[700],
  },
  earningBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
    alignItems: "center",
  },
  earningLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
  },
  earningAmount: {
    marginTop: 4,
    fontSize: 36,
    fontWeight: "800",
    color: colors.success[700],
    letterSpacing: -1,
  },
  earningBreakdown: {
    alignSelf: "stretch",
    marginTop: 12,
    gap: 6,
  },
  earningLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  earningSub: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[600],
  },
  earningSubVal: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[800],
  },
  tipVal: {
    color: colors.success[700],
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.success[800],
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.success[50],
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[500],
  },
  walletBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  walletIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  walletText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#1E3A8A",
    lineHeight: 18,
  },
  homeBtn: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.success[600],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: colors.success[800],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  homeBtnPressed: { opacity: 0.92 },
  homeBtnIcon: {
    marginTop: 1,
  },
  homeBtnLabel: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
});
