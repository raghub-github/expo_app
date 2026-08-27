import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Platform,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { AppText } from "@/components/AppText";
import { LORA_BOLD, LORA_REGULAR, POPPINS_BOLD } from "@/src/theme/headerFonts";
import { RiderDeliveryWalletCoinRain, riderWalletPocketStyles } from "@/src/components/orders/RiderDeliveryWalletCoinRain";

export type SuccessBreakdownRow = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
};

export type RiderDeliverySuccessLayoutProps = {
  title: string;
  subtitle: string;
  totalEarning: number;
  paymentBadgeLabel: string;
  breakdownTitle?: string;
  breakdownRows: SuccessBreakdownRow[];
  totalEarningsLabel: string;
  tripDetailsTitle?: string;
  tripDistanceLabel: string;
  tripDistanceValue: string;
  tripTimeLabel: string;
  tripTimeValue: string;
  tripRatingLabel: string;
  tripRatingValue: string;
  championTitle: string;
  championSubtitle: string;
  ctaLabel: string;
  onClose: () => void;
  onPrimaryCta: () => void;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  walletPocketLabel?: string;
  closeAccessibilityLabel?: string;
  ctaAccessibilityLabel?: string;
};

const PAGE_BG = "#F4F6F5";
const CARD = "#FFFFFF";
const TEXT = "#111827";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
/** Customer app Place Order green */
const BRAND = "#137243";
const BRAND_DARK = "#0F5132";
const BRAND_LIGHT = "#ECFDF5";
const BRAND_BORDER = "#BBF7D0";
/** Fallback until earnings card is measured — half card height for green overlap. */
const EARNINGS_CARD_HALF_FALLBACK = 82;

function formatRupee(amount: number): string {
  const n = Math.round(amount * 10) / 10;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Soft scalloped seal — quadratic curves instead of sharp triangle teeth. */
function buildSoftScallopCirclePath(
  cx: number,
  cy: number,
  radius: number,
  lobes: number,
  depth: number
): string {
  const step = (Math.PI * 2) / lobes;
  let d = "";
  for (let i = 0; i < lobes; i++) {
    const a0 = i * step - Math.PI / 2;
    const a1 = (i + 1) * step - Math.PI / 2;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    const mid = a0 + step / 2;
    const qx = cx + (radius - depth) * Math.cos(mid);
    const qy = cy + (radius - depth) * Math.sin(mid);
    d += i === 0 ? `M ${x0.toFixed(2)} ${y0.toFixed(2)}` : "";
    d += ` Q ${qx.toFixed(2)} ${qy.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return `${d} Z`;
}

const BADGE_SIZE = 94;
const BADGE_CX = BADGE_SIZE / 2;
/** Outer decorative zig-zag ring (stroke only) — slightly inset. */
const OUTER_RING_PATH = buildSoftScallopCirclePath(BADGE_CX, BADGE_CX, 39, 14, 4);
/** Inner white seal. */
const INNER_BADGE_PATH = buildSoftScallopCirclePath(BADGE_CX, BADGE_CX, 33, 14, 5);
const OUTER_RING_COLOR = "#FCD34D";

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

function ZigZagSuccessBadge() {
  const ringScale = useSharedValue(1);
  const ringRotate = useSharedValue(0);

  useEffect(() => {
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    ringRotate.value = withRepeat(
      withTiming(360, { duration: 18_000, easing: Easing.linear }),
      -1,
      false
    );
  }, [ringRotate, ringScale]);

  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }, { rotate: `${ringRotate.value}deg` }],
  }));

  return (
    <View style={styles.zigZagBadgeWrap}>
      <AnimatedSvg
        width={BADGE_SIZE}
        height={BADGE_SIZE}
        viewBox={`0 0 ${BADGE_SIZE} ${BADGE_SIZE}`}
        style={[styles.zigZagRingLayer, ringAnimStyle]}
      >
        <Path
          d={OUTER_RING_PATH}
          fill="none"
          stroke={OUTER_RING_COLOR}
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </AnimatedSvg>
      <Svg width={BADGE_SIZE} height={BADGE_SIZE} viewBox={`0 0 ${BADGE_SIZE} ${BADGE_SIZE}`}>
        <Path d={INNER_BADGE_PATH} fill="#fff" />
      </Svg>
      <View style={styles.zigZagCheckCenter} pointerEvents="none">
        <MaterialCommunityIcons name="check-bold" size={34} color={BRAND} />
      </View>
    </View>
  );
}

function BreakdownLine({ row }: { row: SuccessBreakdownRow }) {
  return (
    <View style={styles.breakdownLine}>
      <View style={styles.breakdownIconWrap}>
        <Ionicons name={row.icon} size={16} color={BRAND} />
      </View>
      <AppText style={styles.breakdownLineLabel} numberOfLines={2}>
        {row.label}
      </AppText>
      <AppText style={styles.breakdownLineValue} bold numberOfLines={1}>
        {row.value}
      </AppText>
    </View>
  );
}

function PrimaryCtaButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const firedRef = useRef(false);

  const handlePress = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onPress();
  };

  return (
    <TouchableOpacity
      style={styles.ctaBtn}
      onPress={handlePress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <AppText style={styles.ctaLabel} bold>
        {label}
      </AppText>
      <Ionicons name="arrow-forward" size={18} color="#fff" />
    </TouchableOpacity>
  );
}

export function RiderDeliverySuccessLayout({
  title,
  subtitle,
  totalEarning,
  paymentBadgeLabel,
  breakdownTitle = "Earnings Breakdown",
  breakdownRows,
  totalEarningsLabel,
  tripDetailsTitle = "Trip Details",
  tripDistanceLabel,
  tripDistanceValue,
  tripTimeLabel,
  tripTimeValue,
  tripRatingLabel,
  tripRatingValue,
  championTitle,
  championSubtitle,
  ctaLabel,
  onPrimaryCta,
  onRefresh,
  refreshing = false,
  walletPocketLabel = "Pocket",
  ctaAccessibilityLabel,
}: RiderDeliverySuccessLayoutProps) {
  const amountAnchorRef = useRef<View>(null);
  const pocketAnchorRef = useRef<View>(null);
  const pocketPulse = useSharedValue(1);
  const pocketHide = useSharedValue(1);
  const [pocketVisible, setPocketVisible] = useState(true);
  const [earningsCardHalfH, setEarningsCardHalfH] = useState(EARNINGS_CARD_HALF_FALLBACK);

  const handleCoinsComplete = useCallback(() => {
    pocketHide.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.ease) }, (finished) => {
      if (finished) {
        runOnJS(setPocketVisible)(false);
      }
    });
  }, [pocketHide]);

  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  const cardY = useSharedValue(24);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 140 });
    opacity.value = withTiming(1, { duration: 360 });
    cardY.value = withDelay(60, withSpring(0, { damping: 15, stiffness: 120 }));
  }, [scale, opacity, cardY]);

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  const pocketAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pocketPulse.value }],
    opacity: pocketHide.value,
  }));

  const formattedTotal = formatRupee(totalEarning);

  const tripStats = useMemo(
    () => [
      {
        key: "distance",
        icon: "navigate-outline" as const,
        label: tripDistanceLabel,
        value: tripDistanceValue,
      },
      {
        key: "time",
        icon: "time-outline" as const,
        label: tripTimeLabel,
        value: tripTimeValue,
      },
      {
        key: "rating",
        icon: "star-outline" as const,
        label: tripRatingLabel,
        value: tripRatingValue,
      },
    ],
    [tripDistanceLabel, tripDistanceValue, tripRatingLabel, tripRatingValue, tripTimeLabel, tripTimeValue]
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#fff"
                colors={[BRAND]}
                progressBackgroundColor="#fff"
              />
            ) : undefined
          }
        >
          <LinearGradient
            colors={[BRAND_DARK, BRAND, "#1A9D55"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.headerGradient, { paddingBottom: earningsCardHalfH + 16 }]}
          >
            <SafeAreaView edges={["top"]} style={styles.headerSafe}>
              <Animated.View style={[styles.headerCenter, heroAnimStyle]}>
                <ZigZagSuccessBadge />
                <AppText style={styles.headerTitle} bold>
                  {title}
                </AppText>
                <AppText style={styles.headerSubtitle}>{subtitle}</AppText>
              </Animated.View>
            </SafeAreaView>
          </LinearGradient>

          <View style={[styles.body, { marginTop: -earningsCardHalfH }]}>
            <Animated.View
              style={[styles.earningsCard, cardAnimStyle]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0) {
                  const half = Math.round(h / 2);
                  setEarningsCardHalfH((prev) => (prev === half ? prev : half));
                }
              }}
            >
              <LinearGradient
                colors={["#FFFFFF", "#FFFFFF", "#F8FCFA", "#F8FCFA"]}
                locations={[0, 0.5, 0.5, 1]}
                style={styles.earningsInner}
              >
                <View style={styles.earningsTopMeta}>
                  <View style={styles.earningsCoinWrap}>
                    <MaterialCommunityIcons name="wallet-outline" size={20} color={BRAND} />
                  </View>
                  <View style={styles.creditedBadge}>
                    <MaterialCommunityIcons name="shield-check" size={13} color={BRAND} />
                    <AppText style={styles.creditedBadgeText} bold>
                      {paymentBadgeLabel}
                    </AppText>
                  </View>
                </View>
                <View style={styles.earningsAmountCenter}>
                  <View ref={amountAnchorRef} collapsable={false} style={styles.earningsFareAnchor}>
                    <AppText style={styles.earningsCardAmount} bold numberOfLines={1}>
                      {formattedTotal}
                    </AppText>
                  </View>
                  <AppText style={styles.earningsCardLabel} bold>
                    Your Earnings
                  </AppText>
                  <AppText style={styles.earningsCardSub}>Trip payout credited</AppText>
                </View>
              </LinearGradient>
            </Animated.View>

            <Animated.View style={[styles.sectionCard, cardAnimStyle]}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="receipt-outline" size={18} color={BRAND} />
                <AppText style={styles.sectionTitle} bold>
                  {breakdownTitle}
                </AppText>
              </View>

              {breakdownRows.map((row) => (
                <BreakdownLine key={row.key} row={row} />
              ))}

              <View style={styles.dashedDivider} />

              <View style={styles.totalRow}>
                <AppText style={styles.totalLabel} bold>
                  {totalEarningsLabel}
                </AppText>
                <AppText style={styles.totalValue} bold>
                  {formattedTotal}
                </AppText>
              </View>
            </Animated.View>

            <Animated.View style={[styles.sectionCard, cardAnimStyle]}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color={BRAND} />
                <AppText style={styles.sectionTitle} bold>
                  {tripDetailsTitle}
                </AppText>
              </View>

              <View style={styles.tripGrid}>
                {tripStats.map((stat) => (
                  <View key={stat.key} style={styles.tripGridCell}>
                    <Ionicons name={stat.icon} size={18} color={BRAND} />
                    <AppText style={styles.tripGridLabel}>{stat.label}</AppText>
                    <AppText style={styles.tripGridValue} bold>
                      {stat.value}
                    </AppText>
                  </View>
                ))}
              </View>
            </Animated.View>

            <Animated.View style={[styles.championBanner, cardAnimStyle]}>
              <View style={styles.championIconWrap}>
                <MaterialCommunityIcons name="medal-outline" size={22} color={BRAND} />
              </View>
              <View style={styles.championTextCol}>
                <AppText style={styles.championTitle} bold>
                  {championTitle}
                </AppText>
                <AppText style={styles.championSub}>{championSubtitle}</AppText>
              </View>
            </Animated.View>
          </View>
        </ScrollView>

        <View style={styles.ctaDock}>
          {pocketVisible ? (
            <Animated.View style={[riderWalletPocketStyles.pocketDock, pocketAnimStyle]}>
              <View
                ref={pocketAnchorRef}
                collapsable={false}
                style={riderWalletPocketStyles.pocketIconWrap}
              >
                <MaterialCommunityIcons name="wallet" size={24} color="#B45309" />
              </View>
              <AppText style={riderWalletPocketStyles.pocketLabel}>{walletPocketLabel}</AppText>
            </Animated.View>
          ) : null}
          <PrimaryCtaButton
            label={ctaLabel}
            onPress={onPrimaryCta}
            accessibilityLabel={ctaAccessibilityLabel ?? ctaLabel}
          />
        </View>
      </SafeAreaView>
      <RiderDeliveryWalletCoinRain
        amountAnchorRef={amountAnchorRef}
        pocketAnchorRef={pocketAnchorRef}
        pocketPulse={pocketPulse}
        onCoinsComplete={handleCoinsComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
    overflow: "visible",
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 12,
  },
  headerGradient: {
    /* paddingBottom set dynamically = half earnings card height */
  },
  headerSafe: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerCenter: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 8,
  },
  zigZagBadgeWrap: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  zigZagRingLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  zigZagCheckCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: LORA_BOLD,
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: LORA_REGULAR,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  body: {
    paddingHorizontal: 16,
    gap: 12,
  },
  earningsCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  earningsInner: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 6,
  },
  earningsTopMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  earningsTitleCol: {
    flex: 1,
    gap: 2,
  },
  earningsCardSub: {
    fontSize: 12,
    fontFamily: LORA_REGULAR,
    color: MUTED,
    textAlign: "center",
    marginTop: 2,
  },
  earningsCoinWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: BRAND_LIGHT,
    borderWidth: 1,
    borderColor: BRAND_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  earningsCardLabel: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: BRAND,
    textAlign: "center",
    marginTop: 4,
  },
  earningsCardAmount: {
    fontSize: 42,
    fontFamily: POPPINS_BOLD,
    color: TEXT,
    letterSpacing: -1,
    textAlign: "center",
  },
  earningsAmountCenter: {
    width: "100%",
    alignItems: "center",
    paddingTop: 4,
    gap: 2,
  },
  earningsFareAnchor: {
    width: "100%",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  creditedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BRAND_BORDER,
  },
  creditedBadgeText: {
    fontSize: 11,
    fontFamily: POPPINS_BOLD,
    color: BRAND,
  },
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: TEXT,
  },
  breakdownLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  breakdownIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: BRAND_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownLineLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: LORA_REGULAR,
    color: TEXT,
  },
  breakdownLineValue: {
    fontSize: 14,
    fontFamily: POPPINS_BOLD,
    color: TEXT,
  },
  dashedDivider: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    marginTop: 4,
    marginBottom: 2,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  totalLabel: {
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: BRAND,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: POPPINS_BOLD,
    color: BRAND,
  },
  tripGrid: {
    flexDirection: "row",
    gap: 8,
  },
  tripGridCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FAFBFC",
  },
  tripGridLabel: {
    fontSize: 11,
    fontFamily: LORA_REGULAR,
    color: MUTED,
    textAlign: "center",
  },
  tripGridValue: {
    fontSize: 14,
    fontFamily: POPPINS_BOLD,
    color: TEXT,
    textAlign: "center",
  },
  championBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: BRAND_LIGHT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  championIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  championTitle: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: TEXT,
  },
  championSub: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: LORA_REGULAR,
    color: MUTED,
  },
  championTextCol: {
    flex: 1,
    minWidth: 0,
  },
  ctaDock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: PAGE_BG,
    gap: 8,
  },
  ctaBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: BRAND,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: BRAND_DARK,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  ctaLabel: {
    fontSize: 16,
    fontFamily: POPPINS_BOLD,
    color: "#fff",
  },
  pressed: {
    opacity: 0.9,
  },
});
