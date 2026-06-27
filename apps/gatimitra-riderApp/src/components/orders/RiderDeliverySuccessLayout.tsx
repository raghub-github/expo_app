import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ScrollView,
  RefreshControl,
  PanResponder,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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

const PAGE_BG = "#F3F5F4";
const CARD = "#FFFFFF";
const TEXT = "#111827";
const MUTED = "#6B7280";
const GREEN = "#22C55E";
const GREEN_DARK = "#15803D";
const GREEN_DEEP = "#0B5E36";
const HEADER_GREEN = "#0E6B40";
const HEADER_GREEN_LIGHT = "#1A8A52";
const BORDER = "#E8ECF0";
const MINT_BANNER = "#ECFDF5";
const MINT_BORDER = "#BBF7D0";
/** ~40% of earnings card sits on green header, ~60% on page background. */
const EARNINGS_CARD_GREEN_OVERLAP = 50;

const CTA_TRACK_H = 54;
const CTA_THUMB = 46;
const CTA_PAD = 4;
const SLIDE_COMPLETE_RATIO = 0.15;
const SLIDE_COMPLETE_MIN_PX = 22;
const TAP_MOVE_MAX_PX = 10;

const CONFETTI = [
  { top: 18, left: 28, size: 6, color: "rgba(255,255,255,0.35)" },
  { top: 42, left: 72, size: 5, color: "rgba(255,255,255,0.28)" },
  { top: 24, right: 36, size: 7, color: "rgba(255,255,255,0.32)" },
  { top: 58, right: 88, size: 5, color: "rgba(255,255,255,0.25)" },
  { top: 12, right: 120, size: 4, color: "rgba(255,255,255,0.3)" },
] as const;

function formatRupee(amount: number): string {
  const n = Math.round(amount * 10) / 10;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

function BreakdownLine({ row }: { row: SuccessBreakdownRow }) {
  return (
    <View style={styles.breakdownLine}>
      <View style={styles.breakdownIconWrap}>
        <Ionicons name={row.icon} size={16} color={MUTED} />
      </View>
      <Text style={styles.breakdownLineLabel} numberOfLines={2}>
        {row.label}
      </Text>
      <Text style={styles.breakdownLineValue} numberOfLines={1}>
        {row.value}
      </Text>
    </View>
  );
}

function SlideOrTapActionButton({
  label,
  onComplete,
  accessibilityLabel,
}: {
  label: string;
  onComplete: () => void;
  accessibilityLabel?: string;
}) {
  const trackWidthRef = useRef(0);
  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const chevronPulse = useSharedValue(1);
  const firedRef = useRef(false);

  const maxDrag = () => Math.max(0, trackWidthRef.current - CTA_THUMB - CTA_PAD * 2);
  const slideThreshold = (max: number) =>
    max > 0 ? Math.max(SLIDE_COMPLETE_MIN_PX, max * SLIDE_COMPLETE_RATIO) : SLIDE_COMPLETE_MIN_PX;

  const fireComplete = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    const max = maxDrag();
    if (max > 0) {
      translateX.value = withSpring(max, { damping: 20, stiffness: 240 });
    }
    isDragging.value = false;
    onComplete();
  };

  const tryCompleteSlide = (dx: number) => {
    if (dx < slideThreshold(maxDrag())) return false;
    fireComplete();
    return true;
  };

  const resetThumb = () => {
    isDragging.value = false;
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    firedRef.current = false;
  };

  useEffect(() => {
    chevronPulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [chevronPulse]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          isDragging.value = true;
        },
        onPanResponderMove: (_, g) => {
          const max = maxDrag();
          translateX.value = Math.max(0, Math.min(g.dx, max));
          tryCompleteSlide(g.dx);
        },
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < TAP_MOVE_MAX_PX && Math.abs(g.dy) < TAP_MOVE_MAX_PX) {
            fireComplete();
            return;
          }
          if (!tryCompleteSlide(g.dx)) {
            resetThumb();
          }
        },
        onPanResponderTerminate: resetThumb,
      }),
    [onComplete, translateX, isDragging]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ scale: chevronPulse.value }],
  }));

  return (
    <View
      style={styles.ctaPressable}
      onLayout={(e) => {
        trackWidthRef.current = e.nativeEvent.layout.width;
      }}
      {...pan.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <LinearGradient
        colors={[GREEN_DEEP, GREEN_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.ctaBtn}
      >
        <Animated.View style={[styles.ctaIconCircle, thumbStyle]}>
          <Animated.View style={[styles.ctaChevronPair, chevronStyle]}>
            <Ionicons name="chevron-forward" size={16} color={GREEN_DARK} />
            <Ionicons name="chevron-forward" size={16} color={GREEN_DARK} style={styles.ctaChevronSecond} />
          </Animated.View>
        </Animated.View>
        <View style={styles.ctaLabelHit} pointerEvents="none">
          <Text style={styles.ctaLabel}>{label}</Text>
          <Text style={styles.ctaHint}>Tap or slide</Text>
        </View>
      </LinearGradient>
    </View>
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
  onClose,
  onPrimaryCta,
  onRefresh,
  refreshing = false,
  walletPocketLabel = "Pocket",
  closeAccessibilityLabel = "Close",
  ctaAccessibilityLabel,
}: RiderDeliverySuccessLayoutProps) {
  const amountAnchorRef = useRef<View>(null);
  const pocketAnchorRef = useRef<View>(null);
  const pocketPulse = useSharedValue(1);
  const pocketHide = useSharedValue(1);
  const [pocketVisible, setPocketVisible] = useState(true);

  const handleCoinsComplete = useCallback(() => {
    pocketHide.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.ease) }, (finished) => {
      if (finished) {
        runOnJS(setPocketVisible)(false);
      }
    });
  }, [pocketHide]);
  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  const cardY = useSharedValue(28);

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
                colors={[GREEN_DARK]}
                progressBackgroundColor="#fff"
              />
            ) : undefined
          }
        >
          <LinearGradient
            colors={[HEADER_GREEN, HEADER_GREEN_LIGHT, "#1F9B58"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.headerGradient}
          >
            {CONFETTI.map((dot, i) => (
              <View
                key={i}
                style={[
                  styles.confettiDot,
                  {
                    top: dot.top,
                    left: "left" in dot ? dot.left : undefined,
                    right: "right" in dot ? dot.right : undefined,
                    width: dot.size,
                    height: dot.size,
                    borderRadius: dot.size / 2,
                    backgroundColor: dot.color,
                  },
                ]}
              />
            ))}

            <SafeAreaView edges={["top"]} style={styles.headerSafe}>
              <View style={styles.headerTopRow}>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.circleBtn, pressed && styles.pressed]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={closeAccessibilityLabel}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
              </View>

              <Animated.View style={[styles.headerCenter, heroAnimStyle]}>
                <View style={styles.checkOuter}>
                  <Ionicons name="checkmark" size={28} color={GREEN} />
                </View>
                <Text style={styles.headerTitle}>{title}</Text>
                <Text style={styles.headerSubtitle}>{subtitle}</Text>
              </Animated.View>
            </SafeAreaView>
          </LinearGradient>

          <View style={[styles.body, { marginTop: -EARNINGS_CARD_GREEN_OVERLAP }]}>
            <Animated.View style={[styles.earningsCard, cardAnimStyle]}>
              <LinearGradient
                colors={["#F0FDF4", "#FFFFFF", "#FAFFFE"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.earningsCardInner}
              >
                <View style={styles.earningsTopBar} />
                <View style={styles.earningsHeaderRow}>
                  <View style={styles.earningsTitleCol}>
                    <Text style={styles.earningsCardLabel}>Your Earnings</Text>
                    <Text style={styles.earningsCardSub}>Trip payout credited</Text>
                  </View>
                  <View style={styles.earningsCoinWrap}>
                    <MaterialCommunityIcons name="wallet-outline" size={22} color={GREEN_DARK} />
                  </View>
                </View>
                <View style={styles.earningsAmountCenter}>
                  <View ref={amountAnchorRef} collapsable={false} style={styles.earningsFareAnchor}>
                    <Text
                      style={styles.earningsCardAmount}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {formattedTotal}
                    </Text>
                  </View>
                  <View style={styles.creditedBadge}>
                    <MaterialCommunityIcons name="shield-check" size={14} color={GREEN_DARK} />
                    <Text style={styles.creditedBadgeText}>{paymentBadgeLabel}</Text>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            <Animated.View style={[styles.sectionCard, cardAnimStyle]}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="wallet-outline" size={18} color={GREEN_DARK} />
                <Text style={styles.sectionTitle}>{breakdownTitle}</Text>
              </View>

              {breakdownRows.map((row) => (
                <BreakdownLine key={row.key} row={row} />
              ))}

              <View style={styles.dashedDivider} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{totalEarningsLabel}</Text>
                <Text style={styles.totalValue}>{formattedTotal}</Text>
              </View>
            </Animated.View>

            <Animated.View style={[styles.sectionCard, cardAnimStyle]}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color={GREEN_DARK} />
                <Text style={styles.sectionTitle}>{tripDetailsTitle}</Text>
              </View>

              <View style={styles.tripGrid}>
                <View style={styles.tripGridCell}>
                  <Ionicons name="location-outline" size={18} color={GREEN_DARK} />
                  <Text style={styles.tripGridLabel}>{tripDistanceLabel}</Text>
                  <Text style={styles.tripGridValue}>{tripDistanceValue}</Text>
                </View>
                <View style={styles.tripGridCell}>
                  <Ionicons name="time-outline" size={18} color={GREEN_DARK} />
                  <Text style={styles.tripGridLabel}>{tripTimeLabel}</Text>
                  <Text style={styles.tripGridValue}>{tripTimeValue}</Text>
                </View>
              </View>

              <View style={styles.tripFooterRow}>
                <View style={styles.tripFooterItem}>
                  <Ionicons name="star" size={16} color={GREEN} />
                  <Text style={styles.tripFooterLabel}>{tripRatingLabel}</Text>
                  <Text style={styles.tripFooterValue}>{tripRatingValue}</Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View style={[styles.championBanner, cardAnimStyle]}>
              <View style={styles.championIconWrap}>
                <MaterialCommunityIcons name="medal-outline" size={22} color={GREEN_DARK} />
              </View>
              <View style={styles.championTextCol}>
                <Text style={styles.championTitle}>{championTitle}</Text>
                <Text style={styles.championSub}>{championSubtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={MUTED} />
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
              <Text style={riderWalletPocketStyles.pocketLabel}>{walletPocketLabel}</Text>
            </Animated.View>
          ) : null}
          <SlideOrTapActionButton
            label={ctaLabel}
            onComplete={onPrimaryCta}
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
    paddingBottom: 8,
  },
  headerGradient: {
    paddingBottom: EARNINGS_CARD_GREEN_OVERLAP + 8,
    overflow: "hidden",
  },
  confettiDot: {
    position: "absolute",
  },
  headerSafe: {
    paddingHorizontal: 16,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
    paddingTop: 0,
    paddingBottom: 4,
  },
  checkOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 20,
    includeFontPadding: false,
  },
  body: {
    paddingHorizontal: 16,
    gap: 8,
  },
  earningsCard: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D1FAE5",
    minHeight: 124,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
    }),
  },
  earningsCardInner: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 8,
  },
  earningsTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: GREEN,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    fontWeight: "500",
    color: "#6B9E7E",
    includeFontPadding: false,
  },
  earningsCoinWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: MINT_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  earningsCardLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN_DARK,
    includeFontPadding: false,
    letterSpacing: 0.2,
  },
  earningsCardAmount: {
    marginTop: 2,
    fontSize: 36,
    fontWeight: "900",
    color: TEXT,
    letterSpacing: -1.2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },
  earningsAmountCenter: {
    width: "100%",
    alignItems: "center",
    paddingTop: 2,
    gap: 8,
  },
  earningsFareAnchor: {
    width: "100%",
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  creditedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: MINT_BANNER,
    borderWidth: 1,
    borderColor: MINT_BORDER,
  },
  creditedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: GREEN_DARK,
    includeFontPadding: false,
  },
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
    includeFontPadding: false,
  },
  breakdownLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 1,
  },
  breakdownIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownLineLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: TEXT,
    includeFontPadding: false,
  },
  breakdownLineValue: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    includeFontPadding: false,
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
    fontWeight: "800",
    color: GREEN_DARK,
    includeFontPadding: false,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: GREEN_DARK,
    includeFontPadding: false,
  },
  tripGrid: {
    flexDirection: "row",
    gap: 10,
  },
  tripGridCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FAFBFC",
  },
  tripGridLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    includeFontPadding: false,
  },
  tripGridValue: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    includeFontPadding: false,
  },
  tripFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
  },
  tripFooterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  tripFooterLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    includeFontPadding: false,
  },
  tripFooterValue: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    includeFontPadding: false,
  },
  championBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: MINT_BANNER,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: MINT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  championIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  championTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
    includeFontPadding: false,
  },
  championSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    includeFontPadding: false,
  },
  championTextCol: {
    flex: 1,
    minWidth: 0,
  },
  ctaDock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: PAGE_BG,
  },
  ctaPressable: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  ctaBtn: {
    minHeight: CTA_TRACK_H,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: GREEN_DEEP,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  ctaIconCircle: {
    marginLeft: CTA_PAD,
    width: CTA_THUMB,
    height: CTA_THUMB,
    borderRadius: CTA_THUMB / 2,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  ctaChevronPair: {
    flexDirection: "row",
    alignItems: "center",
  },
  ctaChevronSecond: {
    marginLeft: -10,
  },
  ctaLabelHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingLeft: 12,
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    includeFontPadding: false,
  },
  ctaHint: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.9,
  },
});
