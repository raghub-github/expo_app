import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  isActiveRiderOrder,
  openActiveOrder,
  pickPrimaryActiveOrder,
} from "@/src/lib/active-order-display";
import {
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
  useActiveOrders,
} from "@/src/hooks/useOrders";

type Props = {
  params: Record<string, string | string[] | undefined>;
};

const GREEN_DARK = "#166534";
const GREEN_BTN = "#15803d";
const GREEN_PILL_BG = "#DCFCE7";
const GREEN_PILL_TEXT = "#15803d";

const CONFETTI_DOTS = [
  { top: 4, left: 18, color: "#22C55E", size: 7 },
  { top: 14, right: 22, color: "#3B82F6", size: 8 },
  { top: 0, right: 68, color: "#EC4899", size: 6 },
  { top: 32, left: 52, color: "#8B5CF6", size: 7 },
  { top: 48, right: 44, color: "#F59E0B", size: 6 },
  { top: 56, left: 28, color: "#10B981", size: 5 },
] as const;

function DashedDivider() {
  return (
    <View style={styles.dashedWrap}>
      {Array.from({ length: 28 }).map((_, i) => (
        <View key={i} style={styles.dashSegment} />
      ))}
    </View>
  );
}

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
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={18} color={GREEN_DARK} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MetaRow({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIconWrap}>
        <Ionicons name={icon} size={16} color={GREEN_DARK} />
      </View>
      <Text style={styles.metaText} numberOfLines={2}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
    </View>
  );
}

export function FoodDeliverySuccessScreen({ params: rawParams }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params: FoodDeliverySuccessParams = parseFoodDeliverySuccessParams(rawParams);
  const footerBottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 18 : 14);
  const kindRaw = rawParams.kind;
  const isRide =
    (typeof kindRaw === "string" ? kindRaw : Array.isArray(kindRaw) ? kindRaw[0] : "") === "ride";

  const { data: activeOrders = [] } = useActiveOrders();
  const nextOrder = useMemo(() => {
    const remaining = activeOrders.filter(
      (order) => isActiveRiderOrder(order) && order.id !== params.orderId
    );
    return pickPrimaryActiveOrder(remaining);
  }, [activeOrders, params.orderId]);

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const cardY = useSharedValue(28);
  const navigatedRef = useRef(false);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
  }, [queryClient]);

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
  const displayId = params.displayId?.trim() || params.orderId;

  const hasNextOrder = nextOrder != null;
  const ctaLabel = hasNextOrder
    ? t("orders.deliverySuccess.goToNextOrder", "Go to Next Order")
    : t("orders.deliverySuccess.backToHome", "Back to Home");
  const ctaLeftIcon: React.ComponentProps<typeof Ionicons>["name"] = hasNextOrder
    ? "bicycle-outline"
    : "grid-outline";

  const handleCopyOrderId = () => {
    Alert.alert(
      t("orders.deliverySuccess.orderIdCopiedTitle", "Order ID"),
      `#${displayId}`
    );
  };

  const handlePrimaryCta = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (nextOrder) {
      openActiveOrder(nextOrder);
      return;
    }
    router.replace("/(tabs)/orders");
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={["#D1FAE5", "#ECFDF5", "#F7FEF9", "#FFFFFF"]}
        locations={[0, 0.22, 0.45, 0.7]}
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
            <Ionicons name="headset-outline" size={16} color={colors.gray[700]} />
            <Text style={styles.helpText}>{t("common.help", "Help")}</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <Animated.View style={[styles.hero, heroStyle]}>
            <View style={styles.checkWrap}>
              {CONFETTI_DOTS.map((dot, i) => (
                <View
                  key={i}
                  style={[
                    styles.confettiDot,
                    {
                      backgroundColor: dot.color,
                      width: dot.size,
                      height: dot.size,
                      borderRadius: dot.size / 2,
                      top: dot.top,
                      left: "left" in dot ? dot.left : undefined,
                      right: "right" in dot ? dot.right : undefined,
                    },
                  ]}
                />
              ))}
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={44} color="#ffffff" />
              </View>
            </View>
            <Text style={styles.title}>
              {isRide
                ? t("orders.rideSuccess.title", "Ride Completed!")
                : t("orders.deliverySuccess.title", "Order Delivered!")}
            </Text>
            <Text style={styles.subtitle}>
              {isRide
                ? t(
                    "orders.rideSuccess.subtitle",
                    "Great job! The passenger has reached their destination."
                  )
                : t(
                    "orders.deliverySuccess.subtitle",
                    "Great job! 🍕 The customer has received their order."
                  )}
            </Text>
          </Animated.View>

          <Animated.View style={[styles.orderCard, cardStyle]}>
            <View style={styles.orderIdRow}>
              <Text style={styles.orderLabel}>
                {t("orders.deliverySuccess.orderIdLabel", "Order ID")}
              </Text>
              <Pressable
                onPress={handleCopyOrderId}
                style={({ pressed }) => [styles.orderIdPill, pressed && styles.pillPressed]}
              >
                <Text style={styles.orderIdPillText}>#{displayId}</Text>
                <Ionicons name="copy-outline" size={14} color={GREEN_PILL_TEXT} />
              </Pressable>
            </View>

            {params.merchantName ? (
              <MetaRow icon="storefront-outline" label={params.merchantName} />
            ) : null}

            {params.customerName ? (
              <MetaRow icon="person-outline" label={params.customerName} />
            ) : null}

            <DashedDivider />

            <View style={styles.earningBlock}>
              <Text style={styles.earningLabel}>
                {t("orders.deliverySuccess.youEarned", "You Earned")}
              </Text>
              <View style={styles.earningAmountRow}>
                <Text style={styles.leafIcon}>🌿</Text>
                <Text style={styles.earningAmount}>
                  ₹{totalEarning.toLocaleString("en-IN")}
                </Text>
                <Text style={styles.leafIcon}>🌿</Text>
              </View>
              <View style={styles.paymentBadge}>
                <Ionicons name="checkmark-circle" size={14} color={GREEN_DARK} />
                <Text style={styles.paymentBadgeText}>
                  {t("orders.deliverySuccess.paymentReceived", "Payment Received")}
                </Text>
              </View>
            </View>

            <View style={styles.deliveryFeeRow}>
              <Text style={styles.deliveryFeeLabel}>
                {t("orders.deliverySuccess.deliveryFee", "Delivery Fee")}
              </Text>
              <Text style={styles.deliveryFeeValue}>
                ₹{baseEarning.toLocaleString("en-IN")}
              </Text>
            </View>

            {tipAmount > 0 ? (
              <View style={styles.tipRow}>
                <Text style={styles.deliveryFeeLabel}>
                  {t("orders.deliverySuccess.tip", "Customer tip")}
                </Text>
                <Text style={styles.tipValue}>+ ₹{tipAmount.toLocaleString("en-IN")}</Text>
              </View>
            ) : null}
          </Animated.View>

          <View style={styles.feedbackCard}>
            <View style={styles.feedbackIconWrap}>
              <Ionicons name="ribbon" size={20} color={GREEN_DARK} />
            </View>
            <View style={styles.feedbackCopy}>
              <Text style={styles.feedbackTitle}>
                {t(
                  "orders.deliverySuccess.feedback",
                  "Great delivery! Awesome work! Keep it up."
                )}
              </Text>
              <Text style={styles.feedbackSub}>
                {t(
                  "orders.deliverySuccess.feedbackSub",
                  "Your performance is excellent."
                )}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </View>

          <View style={styles.statsRow}>
            <StatCard
              icon="time-outline"
              label={t("orders.deliverySuccess.tripTime", "Trip Time")}
              value={tripMinutes > 0 ? `${tripMinutes} min` : "—"}
            />
            <StatCard
              icon="navigate-outline"
              label={t("orders.deliverySuccess.distance", "Distance")}
              value={distanceLabel}
            />
          </View>

          <View style={styles.walletCard}>
            <View style={styles.walletIconWrap}>
              <Ionicons name="wallet" size={20} color="#1D4ED8" />
            </View>
            <View style={styles.walletCopy}>
              <Text style={styles.walletTitle}>
                {t(
                  "orders.deliverySuccess.walletNote",
                  "Your earnings will be added to your wallet shortly."
                )}
              </Text>
              <Text style={styles.walletSub}>
                {t(
                  "orders.deliverySuccess.walletSub",
                  "You will receive a notification once the amount is credited."
                )}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#93C5FD" />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: footerBottomPad }]}>
          <Pressable
            onPress={handlePrimaryCta}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
          >
            <Ionicons name={ctaLeftIcon} size={20} color="#ffffff" />
            <Text style={styles.primaryBtnLabel}>{ctaLabel}</Text>
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </Pressable>
        </View>
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
    paddingBottom: 6,
  },
  topBarSpacer: { flex: 1 },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.gray[200],
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  helpBtnPressed: { opacity: 0.88 },
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#ffffff",
  },
  hero: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 18,
  },
  checkWrap: {
    position: "relative",
    marginBottom: 18,
    alignItems: "center",
    justifyContent: "center",
    width: 130,
    height: 110,
  },
  confettiDot: {
    position: "absolute",
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success[600],
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: colors.success[700],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.6,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: GREEN_DARK,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 16,
  },
  orderCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.gray[100],
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  orderIdRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  orderLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
  },
  orderIdPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GREEN_PILL_BG,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pillPressed: { opacity: 0.85 },
  orderIdPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: GREEN_PILL_TEXT,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[100],
  },
  metaIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.success[50],
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  metaText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.gray[800],
    lineHeight: 19,
  },
  dashedWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginVertical: 16,
    overflow: "hidden",
  },
  dashSegment: {
    width: 6,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.gray[300],
  },
  earningBlock: {
    alignItems: "center",
    paddingBottom: 4,
  },
  earningLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
    marginBottom: 6,
  },
  earningAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leafIcon: {
    fontSize: 18,
  },
  earningAmount: {
    fontSize: 40,
    fontWeight: "800",
    color: GREEN_DARK,
    letterSpacing: -1,
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: GREEN_DARK,
  },
  deliveryFeeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[100],
  },
  tipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  deliveryFeeLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray[600],
  },
  deliveryFeeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
  },
  tipValue: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN_DARK,
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  feedbackIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  feedbackCopy: {
    flex: 1,
    gap: 2,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: GREEN_DARK,
    lineHeight: 19,
  },
  feedbackSub: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.success[700],
    lineHeight: 17,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.success[50],
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.success[100],
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.gray[900],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[500],
    textTransform: "capitalize",
  },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  walletIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCopy: {
    flex: 1,
    gap: 3,
  },
  walletTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
    lineHeight: 18,
  },
  walletSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "#3B82F6",
    lineHeight: 16,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: GREEN_BTN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 14,
    ...Platform.select({
      ios: {
        shadowColor: GREEN_DARK,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  primaryBtnPressed: { opacity: 0.92 },
  primaryBtnLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
