import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
  Alert,
  Image as RNImage,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQueryClient } from "@tanstack/react-query";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  parseFoodDeliverySuccessParams,
  riderEarningLikeFromDeliverySuccessParams,
  type FoodDeliverySuccessParams,
} from "@/src/lib/food-delivery-success-nav";
import { formatDistanceKm } from "@/src/lib/incoming-order-display";
import {
  buildRiderDeliveryEarningBreakdown,
} from "@/src/lib/rider-earning-display";
import {
  isActiveRiderOrder,
  openActiveOrder,
  pickPrimaryActiveOrder,
} from "@/src/lib/active-order-display";
import {
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
  useActiveOrders,
  useRideOrder,
} from "@/src/hooks/useOrders";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { toAbsoluteImageUrl } from "@/src/utils/mediaUrl";

type Props = {
  params: Record<string, string | string[] | undefined>;
};

const PAGE_BG = "#F4F7F6";
const CARD = "#FFFFFF";
const TEXT = "#111827";
const MUTED = "#6B7280";
const NAVY = "#0F1B2E";
const GREEN = "#22C55E";
const GREEN_DARK = "#16A34A";
const GREEN_LIGHT = "#4ADE80";
const PURPLE = "#7C3AED";
const PURPLE_SOFT = "#F3E8FF";
const PURPLE_BORDER = "#DDD6FE";
const MINT_SOFT = "#ECFDF5";
const MINT_BORDER = "#BBF7D0";
const ORANGE = "#F97316";

const FOOTER_BTN_H = 52;
const FOOD_HERO_IMAGE = require("@/assets/images/mapbike.png");

const CONFETTI_DOTS = [
  { top: 6, left: 18, color: "#22C55E", size: 7 },
  { top: 14, right: 22, color: "#8B5CF6", size: 6 },
  { top: 2, right: 68, color: "#F97316", size: 5 },
  { top: 28, left: 52, color: "#3B82F6", size: 6 },
  { top: 36, right: 48, color: "#EC4899", size: 5 },
] as const;

function initialsFromName(name?: string | null) {
  if (!name?.trim()) return "GM";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

function DotGrid({ side }: { side: "left" | "right" }) {
  return (
    <View style={[styles.dotGrid, side === "left" ? styles.dotGridLeft : styles.dotGridRight]}>
      {Array.from({ length: 12 }).map((_, i) => (
        <View key={i} style={styles.dotCell} />
      ))}
    </View>
  );
}

function FareLine({
  icon,
  iconColor,
  iconBg,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fareLine}>
      <View style={[styles.fareIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.fareLineLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.fareLineValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function surgeIconForName(name: string): {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  bg: string;
} {
  const lower = name.toLowerCase();
  if (lower.includes("night")) {
    return { icon: "moon", color: "#EC4899", bg: "#FCE7F3" };
  }
  if (lower.includes("rain")) {
    return { icon: "rainy", color: "#3B82F6", bg: "#DBEAFE" };
  }
  return { icon: "flash", color: "#F59E0B", bg: "#FEF3C7" };
}

function fareLineStyleForLabel(
  label: string,
  t: (key: string, fallback: string) => string
): {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  bg: string;
} {
  const deliveryFee = t("orders.deliverySuccess.deliveryFee", "Delivery Fee");
  const waitingCharge = t("orders.rideSuccess.waitingCharge", "Waiting Charge");
  const tipLabel = t("orders.deliverySuccess.tip", "Customer tip");
  if (label === deliveryFee) {
    return { icon: "bicycle", color: GREEN_DARK, bg: "#DCFCE7" };
  }
  if (label === waitingCharge) {
    return { icon: "time", color: PURPLE, bg: "#EDE9FE" };
  }
  if (label === tipLabel) {
    return { icon: "heart", color: "#EF4444", bg: "#FEE2E2" };
  }
  return surgeIconForName(label);
}

export function FoodDeliverySuccessScreen({ params: rawParams }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params: FoodDeliverySuccessParams = parseFoodDeliverySuccessParams(rawParams);
  const { data: profile } = useRiderProfile();
  const { data: riderStatus } = useRiderStatus();

  const { data: activeOrders = [] } = useActiveOrders();
  const nextOrder = useMemo(() => {
    const remaining = activeOrders.filter(
      (order) => isActiveRiderOrder(order) && order.id !== params.orderId
    );
    return pickPrimaryActiveOrder(remaining);
  }, [activeOrders, params.orderId]);

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const cardY = useSharedValue(24);
  const navigatedRef = useRef(false);

  const { data: orderDetail } = useRideOrder(params.orderId, {
    refetchInterval: (query) => {
      const rating = query.state.data?.passengerRating;
      return rating != null && rating >= 1 ? false : 3000;
    },
  });

  const customerRating = useMemo(() => {
    const raw = orderDetail?.passengerRating;
    if (raw == null || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(5, Math.round(raw)));
  }, [orderDetail?.passengerRating]);

  const earningBreakdown = useMemo(() => {
    const source = orderDetail ?? riderEarningLikeFromDeliverySuccessParams(params);
    return buildRiderDeliveryEarningBreakdown(source, t);
  }, [orderDetail, params, t]);

  const breakdownLines = useMemo(
    () => earningBreakdown.lines.filter((line) => !line.emphasis && line.amount > 0),
    [earningBreakdown.lines]
  );

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 380 });
    cardY.value = withDelay(80, withSpring(0, { damping: 14, stiffness: 120 }));
  }, [scale, opacity, cardY]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  const totalEarning = earningBreakdown.totalEarning;
  const tripMinutes = Number(params.tripMinutes) || 0;
  const distanceLabel = params.distanceKm
    ? formatDistanceKm(Number(params.distanceKm))
    : "—";
  const displayId = params.displayId?.trim() || params.orderId;
  const merchantName =
    params.merchantName?.trim() ||
    t("orders.activeFood.merchantFallback", "Restaurant");
  const customerName =
    params.customerName?.trim() ||
    t("orders.activeRide.customerFallback", "Customer");

  const riderName = profile?.name?.trim() || riderStatus?.name?.trim() || "Rider";
  const avatarUri = toAbsoluteImageUrl(profile?.selfieUrl ?? riderStatus?.selfieUrl);
  const avatarInitials = initialsFromName(riderName);

  const hasNextOrder = nextOrder != null;
  const ctaLabel = hasNextOrder
    ? t("orders.deliverySuccess.goToNextOrder", "Go to Next Order")
    : t("orders.deliverySuccess.goToHome", "Go to Home");

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
        colors={["#D1FAE5", "#ECFDF5", "#F0FDF4", PAGE_BG]}
        locations={[0, 0.2, 0.42, 0.78]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.push("/raise-ticket")}
            style={({ pressed }) => [styles.helpBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("common.help", "Help")}
          >
            <View style={styles.helpBtnRow}>
              <Ionicons name="headset-outline" size={15} color={MUTED} />
              <Text style={styles.helpText} numberOfLines={1}>
                {t("common.help", "Help")}
              </Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.heroBlock, heroStyle]}>
            <Text style={styles.yayText}>
              {t("orders.deliverySuccess.yay", "Yay! 🎉")}
            </Text>
            <Text style={styles.heroTitle}>
              {t("orders.deliverySuccess.title", "Order Delivered!")}
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={2}>
              {t(
                "orders.deliverySuccess.subtitle",
                "Great job! The customer has received their order."
              )}
            </Text>

            <View style={styles.heroScene}>
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

              <View style={styles.checkBadge}>
                <View style={styles.checkCircle}>
                  <Ionicons name="checkmark" size={24} color="#ffffff" />
                </View>
              </View>

              <View style={styles.routeDecor}>
                <View style={styles.routeLine} />
                <View style={styles.pathArc} />
                <View style={styles.storePin}>
                  <Ionicons name="storefront" size={18} color={ORANGE} />
                </View>
                <View style={styles.destPin}>
                  <Ionicons name="home" size={18} color={PURPLE} />
                </View>
              </View>

              <RNImage source={FOOD_HERO_IMAGE} style={styles.foodHero} resizeMode="contain" />
            </View>
          </Animated.View>

          <Animated.View style={[styles.orderCard, cardStyle]}>
            <View style={styles.orderCardLeft}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{avatarInitials}</Text>
                </View>
              )}
              <View style={styles.orderMeta}>
                <Text style={styles.merchantName} numberOfLines={1}>
                  {merchantName}
                </Text>
                <Text style={styles.customerName} numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
            </View>

            <View style={styles.orderDivider} />

            <Pressable
              onPress={handleCopyOrderId}
              style={({ pressed }) => [styles.orderIdCol, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Order ID ${displayId}`}
            >
              <View style={styles.orderIdRow}>
                <Text style={styles.orderIdValue} numberOfLines={1}>
                  #{displayId}
                </Text>
                <Ionicons name="copy-outline" size={14} color={PURPLE} />
              </View>
              <Text style={styles.orderIdLabel}>
                {t("orders.deliverySuccess.orderIdLabel", "Order ID")}
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={[styles.earningsShell, cardStyle]}>
            <DotGrid side="left" />
            <DotGrid side="right" />

            <View style={styles.secureBadge}>
              <MaterialCommunityIcons name="shield-check" size={13} color={GREEN_LIGHT} />
              <Text style={styles.secureBadgeText}>
                {t("orders.deliverySuccess.securePayout", "Secure Payout")}
              </Text>
            </View>

            <Text style={styles.earnedLabel}>
              {t("orders.deliverySuccess.youEarned", "You Earned")}
            </Text>

            <Text
              style={styles.earnedAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              ₹{totalEarning.toLocaleString("en-IN")}
            </Text>

            <View style={styles.paymentBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
              <Text style={styles.paymentBadgeText}>
                {t("orders.deliverySuccess.paymentReceived", "Payment Received")}
              </Text>
            </View>

            <View style={styles.breakdownCard}>
              {breakdownLines.map((line) => {
                const lineStyle = fareLineStyleForLabel(line.label, t);
                const isAdditive =
                  line.label !==
                  t("orders.deliverySuccess.deliveryFee", "Delivery Fee");
                return (
                  <FareLine
                    key={line.label}
                    icon={lineStyle.icon}
                    iconColor={lineStyle.color}
                    iconBg={lineStyle.bg}
                    label={line.label}
                    value={`${isAdditive ? "+ " : ""}₹${line.amount.toLocaleString("en-IN")}`}
                  />
                );
              })}

              <View style={styles.statsDivider} />

              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <View style={styles.statIconRow}>
                    <Ionicons name="time-outline" size={15} color={GREEN_DARK} />
                    <Text style={styles.statValue}>
                      {tripMinutes > 0 ? `${tripMinutes} min` : "—"}
                    </Text>
                  </View>
                  <Text style={styles.statLabel}>
                    {t("orders.deliverySuccess.totalTime", "Total Time")}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCol}>
                  <View style={styles.statIconRow}>
                    <Ionicons name="navigate-outline" size={15} color={GREEN_DARK} />
                    <Text style={styles.statValue}>{distanceLabel}</Text>
                  </View>
                  <Text style={styles.statLabel}>
                    {t("orders.deliverySuccess.totalDistance", "Total Distance")}
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>

          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackEmoji}>{customerRating > 0 ? "⭐" : "🍕"}</Text>
            <View style={styles.feedbackTextCol}>
              <Text style={styles.feedbackTitle}>
                {customerRating > 0
                  ? t("orders.deliverySuccess.customerRatedTitle", "Customer rated you!")
                  : t("orders.deliverySuccess.feedbackTitle", "Great delivery!")}
              </Text>
              <Text style={styles.feedbackSub} numberOfLines={1}>
                {customerRating > 0
                  ? t(
                      "orders.deliverySuccess.customerRatedSub",
                      "{{rating}} star rating received.",
                      { rating: customerRating }
                    )
                  : t(
                      "orders.deliverySuccess.customerRatingPending",
                      "Customer rating will appear here shortly."
                    )}
              </Text>
            </View>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = customerRating > 0 && n <= customerRating;
                return (
                  <Ionicons
                    key={n}
                    name={filled ? "star" : "star-outline"}
                    size={18}
                    color={filled ? "#F59E0B" : "#D1D5DB"}
                  />
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/(tabs)/earnings")}
            style={styles.walletNotePress}
            android_ripple={{ color: "rgba(91, 33, 182, 0.12)" }}
          >
            <View style={styles.walletNote}>
              <View style={styles.walletNoteRow}>
                <Ionicons
                  name="wallet-outline"
                  size={16}
                  color="#5B21B6"
                  style={styles.walletNoteIcon}
                />
                <Text style={styles.walletNoteText} numberOfLines={1}>
                  {t(
                    "orders.deliverySuccess.walletNote",
                    "Your earnings will be added to your wallet shortly."
                  )}
                </Text>
              </View>
            </View>
          </Pressable>
        </ScrollView>

        <View style={styles.ctaDock}>
          <Pressable
            onPress={handlePrimaryCta}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            android_ripple={{ color: "rgba(255,255,255,0.28)" }}
            style={({ pressed }) => [
              styles.primaryBtnOuter,
              pressed && styles.primaryBtnPressed,
            ]}
          >
            <LinearGradient
              colors={["#15803D", "#22C55E", "#4ADE80"]}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnLabel} numberOfLines={1}>
                {ctaLabel}
              </Text>
              <View style={styles.primaryBtnIconWrap}>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  helpBtn: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  helpBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  helpText: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
    flexShrink: 0,
    includeFontPadding: false,
  },
  pressed: { opacity: 0.88 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    gap: 10,
  },
  heroBlock: {
    alignItems: "center",
    paddingBottom: 2,
  },
  yayText: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
    marginBottom: 1,
    includeFontPadding: false,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: NAVY,
    letterSpacing: -0.4,
    textAlign: "center",
    includeFontPadding: false,
  },
  heroSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 16,
    includeFontPadding: false,
  },
  heroScene: {
    width: "100%",
    height: 104,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  confettiDot: {
    position: "absolute",
    zIndex: 2,
  },
  checkBadge: {
    position: "absolute",
    top: 0,
    zIndex: 4,
    alignItems: "center",
  },
  checkCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    ...Platform.select({
      ios: {
        shadowColor: GREEN_DARK,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  routeDecor: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    height: 58,
    zIndex: 1,
  },
  routeLine: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  pathArc: {
    position: "absolute",
    right: 54,
    bottom: 18,
    width: 72,
    height: 36,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: GREEN,
    borderTopRightRadius: 36,
  },
  storePin: {
    position: "absolute",
    left: 24,
    bottom: 42,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  destPin: {
    position: "absolute",
    right: 38,
    bottom: 42,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  foodHero: {
    width: 148,
    height: 72,
    zIndex: 3,
    marginBottom: 0,
  },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  orderCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MINT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: MINT_BORDER,
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "800",
    color: GREEN_DARK,
  },
  orderMeta: {
    flex: 1,
    minWidth: 0,
  },
  merchantName: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    includeFontPadding: false,
  },
  customerName: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    includeFontPadding: false,
  },
  orderDivider: {
    width: 1,
    height: 42,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 12,
  },
  orderIdCol: {
    alignItems: "flex-end",
    minWidth: 96,
    maxWidth: 130,
  },
  orderIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderIdValue: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    includeFontPadding: false,
  },
  orderIdLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    includeFontPadding: false,
  },
  earningsShell: {
    backgroundColor: NAVY,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: "hidden",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  dotGrid: {
    position: "absolute",
    top: 52,
    width: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    opacity: 0.35,
  },
  dotGridLeft: { left: 8 },
  dotGridRight: { right: 8 },
  dotCell: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#94A3B8",
  },
  secureBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(34, 197, 94, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.35)",
  },
  secureBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: GREEN_LIGHT,
    includeFontPadding: false,
  },
  earnedLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
    includeFontPadding: false,
  },
  earnedAmount: {
    textAlign: "center",
    fontSize: 34,
    fontWeight: "800",
    color: GREEN_LIGHT,
    letterSpacing: -1,
    marginTop: 1,
    includeFontPadding: false,
  },
  paymentBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: GREEN_DARK,
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    includeFontPadding: false,
  },
  breakdownCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 7,
  },
  fareLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fareIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fareLineLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
    includeFontPadding: false,
  },
  fareLineValue: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    includeFontPadding: false,
  },
  statsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginTop: 2,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    includeFontPadding: false,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    includeFontPadding: false,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E5E7EB",
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: MINT_SOFT,
    borderWidth: 1,
    borderColor: MINT_BORDER,
  },
  feedbackEmoji: {
    fontSize: 22,
  },
  feedbackTextCol: {
    flex: 1,
    minWidth: 0,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: GREEN_DARK,
    includeFontPadding: false,
  },
  feedbackSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    includeFontPadding: false,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  walletNotePress: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  walletNote: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: PURPLE_SOFT,
    borderWidth: 1,
    borderColor: PURPLE_BORDER,
  },
  walletNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 10,
  },
  walletNoteIcon: {
    flexShrink: 0,
  },
  walletNoteText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: "#5B21B6",
    lineHeight: 16,
    includeFontPadding: false,
  },
  ctaDock: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: CARD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  primaryBtnOuter: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  primaryBtnPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  primaryBtn: {
    width: "100%",
    height: FOOTER_BTN_H,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  primaryBtnIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
});
