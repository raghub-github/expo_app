import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  Animated as RNAnimated,
  PanResponder,
  Vibration,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import {
  formatRiderAcceptCountdown,
  riderAcceptSecondsLeft,
  riderAcceptTimeProgress,
} from "@/src/lib/riderOrderAcceptWindow";
import {
  categoryBannerIcon,
  formatDistanceKm,
  formatOrderTypeLabel,
  incomingOrderAcceptLabel,
  incomingOrderBadgeLabel,
  incomingOrderBannerLabel,
} from "@/src/lib/incoming-order-display";
import { resolveRiderDisplayedEarning } from "@/src/lib/rider-earning-display";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export type IncomingDispatchOrder = {
  id: string;
  category: RiderOrderSummary["category"];
  formattedOrderId?: string | null;
  rideType?: string;
  merchantName?: string | null;
  itemCount?: number;
  pickup: { address: string; lat: number; lng: number };
  delivery: { address: string; lat: number; lng: number };
  distanceKm?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  estimatedEarning: number;
  baseEarning?: number;
  customerTipAmount?: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
  totalEarning?: number;
  higherDispatchPriority?: boolean;
  createdAt: string;
  acceptDeadlineAt?: string;
  offerShownAtMs?: number;
};

/** @deprecated use IncomingDispatchOrder */
export type IncomingRideOrder = IncomingDispatchOrder;

type Props = {
  visible: boolean;
  order: IncomingDispatchOrder | null;
  loading?: boolean;
  acceptSwipeResetKey?: number;
  onAccept: () => void;
  onReject: () => void;
  onExpired?: () => void;
};

const H_PADDING = 16;
const CARD_RADIUS = 16;
const BADGE_W = 168;
const BADGE_H = 42;
const BADGE_STROKE = 4;
const BADGE_OVERLAP = BADGE_H * 0.2;
const URGENT_SECONDS = 20;
const ACCEPT_HANDLE_W = 44;
const ACCEPT_HANDLE_INSET = 6;

function buildPillOutlinePath(w: number, h: number, inset: number): string {
  const x = inset;
  const y = inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const r = ih / 2;
  if (iw < ih) return "";
  const topCx = x + iw / 2;
  return [
    `M ${topCx} ${y}`,
    `L ${x + iw - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + iw} ${y + r}`,
    `V ${y + ih - r}`,
    `A ${r} ${r} 0 0 1 ${x + iw - r} ${y + ih}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + ih - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `H ${topCx}`,
    "Z",
  ].join(" ");
}

function pillOutlineLength(w: number, h: number, inset: number): number {
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  if (iw < ih) return 0;
  return 2 * (iw - ih) + Math.PI * ih;
}

function NewRideFusePill({
  borderProgress,
  urgent,
  label,
}: {
  borderProgress: number;
  urgent: boolean;
  label: string;
}) {
  const pulse = useSharedValue(1);
  const entryScale = useSharedValue(0.94);

  useEffect(() => {
    entryScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    const pulseTo = urgent ? 1.04 : 1.02;
    const pulseMs = urgent ? 420 : 850;
    pulse.value = withRepeat(
      withSequence(
        withTiming(pulseTo, { duration: pulseMs, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: pulseMs, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [entryScale, pulse, urgent]);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entryScale.value * pulse.value }],
  }));

  const progress = Math.max(0, Math.min(1, borderProgress));
  const borderColor = urgent ? colors.error[600] : colors.success[700];
  const trackColor = urgent ? "rgba(220, 38, 38, 0.28)" : "rgba(21, 128, 61, 0.24)";
  const inset = BADGE_STROKE / 2;
  const pathD = buildPillOutlinePath(BADGE_W, BADGE_H, inset);
  const pathLen = pillOutlineLength(BADGE_W, BADGE_H, inset);
  const dashOffset = (1 - progress) * pathLen;

  return (
    <Animated.View style={[styles.badgeFuseShell, shellStyle]}>
      <Svg width={BADGE_W} height={BADGE_H} style={styles.badgeFuseSvg}>
        <Path d={pathD} stroke={trackColor} strokeWidth={BADGE_STROKE} fill="#FFFFFF" />
        {progress > 0.005 ? (
          <Path
            d={pathD}
            stroke={borderColor}
            strokeWidth={BADGE_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${pathLen} ${pathLen}`}
            strokeDashoffset={dashOffset}
          />
        ) : null}
      </Svg>
      <View style={styles.newOrderBadgePill} pointerEvents="none">
        <Text style={[styles.newOrderBadgeText, urgent && styles.newOrderBadgeTextUrgent]}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

function SwipeHintArrows({ color }: { color: string }) {
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [shift]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }],
  }));

  return (
    <Animated.View style={[styles.swipeHintArrows, arrowStyle]}>
      <Ionicons name="chevron-forward" size={15} color={color} />
      <Ionicons name="chevron-forward" size={15} color={color} style={styles.acceptChevronSecond} />
    </Animated.View>
  );
}

function AcceptRideSwipeButton({
  loading,
  disabled,
  countdown,
  timeProgress,
  urgent,
  label,
  resetKey = 0,
  onPress,
}: {
  loading: boolean;
  disabled: boolean;
  countdown: string;
  timeProgress: number;
  urgent: boolean;
  label: string;
  resetKey?: number;
  onPress: () => void;
}) {
  const trackWidth = useRef(0);
  const dragX = useRef(new RNAnimated.Value(0)).current;
  const confirmedRef = useRef(false);
  const btnPulse = useSharedValue(1);
  const progressWidth = useSharedValue(timeProgress * 100);

  useEffect(() => {
    btnPulse.value = withRepeat(
      withSequence(
        withTiming(1.012, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [btnPulse]);

  useEffect(() => {
    progressWidth.value = withTiming(timeProgress * 100, { duration: 280, easing: Easing.linear });
  }, [progressWidth, timeProgress]);

  const resetDrag = useCallback(() => {
    confirmedRef.current = false;
    RNAnimated.timing(dragX, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [dragX]);

  useEffect(() => {
    resetDrag();
  }, [resetKey, resetDrag]);

  const confirmSwipe = useCallback(() => {
    if (confirmedRef.current || disabled || loading) return;
    confirmedRef.current = true;
    Vibration.vibrate(15);
    const max = Math.max(0, trackWidth.current - ACCEPT_HANDLE_W - ACCEPT_HANDLE_INSET * 2);
    dragX.setValue(max);
    onPress();
  }, [disabled, loading, onPress, dragX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !loading,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled && !loading && Math.abs(gesture.dx) > 6,
      onPanResponderMove: (_, gesture) => {
        if (disabled || loading) return;
        const max = Math.max(0, trackWidth.current - ACCEPT_HANDLE_W - ACCEPT_HANDLE_INSET * 2);
        dragX.setValue(Math.min(max, Math.max(0, gesture.dx)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (disabled || loading) {
          resetDrag();
          return;
        }
        const max = Math.max(0, trackWidth.current - ACCEPT_HANDLE_W - ACCEPT_HANDLE_INSET * 2);
        const threshold = Math.max(22, max * 0.15);
        if (gesture.dx >= threshold) {
          RNAnimated.timing(dragX, {
            toValue: max,
            duration: 140,
            useNativeDriver: true,
          }).start(confirmSwipe);
        } else {
          resetDrag();
        }
      },
      onPanResponderTerminate: () => {
        resetDrag();
      },
    })
  ).current;

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnPulse.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const accent = urgent ? colors.error[600] : colors.success[600];
  const btnBg = urgent ? colors.error[600] : colors.success[500];

  return (
    <Animated.View style={[styles.acceptBtnWrap, wrapStyle]}>
      <View
        style={[styles.acceptBtn, { backgroundColor: btnBg }, disabled && styles.btnDisabled]}
        onLayout={(e) => {
          trackWidth.current = e.nativeEvent.layout.width;
        }}
      >
        <Animated.View style={[styles.acceptProgressFill, progressStyle]} />
        <Text style={styles.acceptText} pointerEvents="none">
          {label} ({countdown})
        </Text>
        <RNAnimated.View
          style={[styles.acceptHandle, { transform: [{ translateX: dragX }] }]}
          {...panResponder.panHandlers}
        >
          {loading ? (
            <ActivityIndicator color={accent} size="small" />
          ) : (
            <SwipeHintArrows color={accent} />
          )}
        </RNAnimated.View>
      </View>
    </Animated.View>
  );
}

function compactAddress(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!out.some((p) => p.toLowerCase() === key)) out.push(part);
  }
  return out.join(", ");
}

function DistanceStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.distanceStat}>
      <Text style={styles.distanceStatLabel}>{label}</Text>
      <Text style={styles.distanceStatValue}>{value}</Text>
    </View>
  );
}

function formatRideTypeLabel(rideType?: string): string {
  return formatOrderTypeLabel(rideType) || "Ride";
}

export function IncomingOrderModal({
  visible,
  order,
  loading = false,
  acceptSwipeResetKey = 0,
  onAccept,
  onReject,
  onExpired,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [nowTick, setNowTick] = useStateNow();

  const secondsLeft = useMemo(() => {
    if (!order) return 0;
    return riderAcceptSecondsLeft(order);
  }, [order, nowTick]);

  const mmss = useMemo(() => formatRiderAcceptCountdown(secondsLeft), [secondsLeft]);
  const fuseProgress = useMemo(() => {
    if (!order) return 1;
    return riderAcceptTimeProgress(order);
  }, [order, nowTick]);
  const fuseUrgent = secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

  const visibleSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (visible && order) {
      visibleSinceRef.current = Date.now();
    } else {
      visibleSinceRef.current = null;
    }
  }, [visible, order?.id]);

  useEffect(() => {
    if (!visible || !order || secondsLeft > 0 || loading) return;
    const shownAt = visibleSinceRef.current;
    if (shownAt != null && Date.now() - shownAt < 600) return;
    onExpired?.();
  }, [visible, order, secondsLeft, loading, onExpired]);

  if (!order) return null;

  const displayId = order.formattedOrderId?.trim() || order.id;
  const rideLabel = formatRideTypeLabel(order.rideType);
  const badgeLabel = incomingOrderBadgeLabel(order.category);
  const bannerLabel = incomingOrderBannerLabel(
    order.category,
    order.category === "ride" ? rideLabel : undefined
  );
  const acceptLabel = incomingOrderAcceptLabel(order.category);
  const bannerIcon = categoryBannerIcon(order.category);
  const isDeliveryOrder = order.category === "food" || order.category === "parcel";
  const slabBase = Math.round(order.baseEarning ?? order.estimatedEarning ?? 0);
  const waitingAmount =
    order.waitingEarning != null && order.waitingEarning > 0
      ? Math.round(order.waitingEarning)
      : 0;
  const surgeLines = order.appliedSurges ?? [];
  const tipAmount =
    order.customerTipAmount != null && order.customerTipAmount > 0
      ? Math.round(order.customerTipAmount)
      : 0;
  const totalEarning = Math.round(resolveRiderDisplayedEarning(order));
  const footerBottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 24 : 12) + 8;
  const pickupKm = order.pickupDistanceKm;
  const tripKm = order.tripDistanceKm ?? order.distanceKm;
  const totalKm =
    pickupKm != null && tripKm != null
      ? pickupKm + tripKm
      : order.totalDistanceKm ?? tripKm ?? pickupKm;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.dismissArea} pointerEvents="none" />

        <View style={styles.sheetStack}>
          <View style={styles.sheetOverlapHeader} pointerEvents="box-none">
            <NewRideFusePill
              borderProgress={fuseProgress}
              urgent={fuseUrgent}
              label={badgeLabel}
            />
            <View style={styles.rejectAnchor} pointerEvents="box-none">
              <Pressable
                onPress={onReject}
                disabled={loading}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("orders.reject", "Reject")}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.rejectPill,
                      loading && styles.btnDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.rejectPillText} numberOfLines={1}>
                      {t("orders.reject", "Reject")}
                    </Text>
                    <Ionicons name="close" size={14} color="#EF4444" />
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.sheet}>
            <View style={styles.sheetTopCap} pointerEvents="none" />
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.categoryBanner}>
                <Ionicons name={bannerIcon} size={14} color={colors.primary[700]} />
                <Text style={styles.categoryBannerText}>{bannerLabel}</Text>
              </View>

              <View style={styles.orderMetaRow}>
                <Text style={styles.orderId}>{displayId}</Text>
                <Text style={styles.orderTime}>
                  {t("orders.incoming.justNow", "Just now")}
                </Text>
              </View>

              {order.merchantName && order.category !== "ride" ? (
                <View style={styles.merchantRow}>
                  <Text style={styles.merchantName} numberOfLines={2}>
                    {order.merchantName}
                  </Text>
                  {order.itemCount != null && order.itemCount > 0 ? (
                    <View style={styles.itemCountPill}>
                      <Ionicons name="bag-handle-outline" size={12} color={colors.primary[800]} />
                      <Text style={styles.itemCountPillText}>
                        {order.itemCount}{" "}
                        {order.itemCount === 1
                          ? t("orders.incoming.itemOne", "item")
                          : t("orders.incoming.itemsShort", "items")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.earningsCard}>
                <View style={styles.earningsBreakdown}>
                  <View style={styles.earningsLine}>
                    <Text style={styles.earningsSubLabel}>
                      {isDeliveryOrder
                        ? t("orders.incoming.deliveryFee", "Delivery fee")
                        : t("orders.incoming.baseEarning", "Base earnings")}
                    </Text>
                    <Text style={styles.earningsSubValue}>
                      ₹{slabBase.toLocaleString("en-IN")}
                    </Text>
                  </View>
                  {waitingAmount > 0 ? (
                    <View style={styles.earningsLine}>
                      <Text style={styles.earningsSubLabel}>
                        {t("orders.incoming.waitingCharge", "Waiting charge")}
                      </Text>
                      <Text style={styles.earningsSubValue}>
                        + ₹{waitingAmount.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : null}
                  {surgeLines.map((surge) => (
                    <View key={`${surge.name}-${surge.amount}`} style={styles.earningsLine}>
                      <View style={styles.tipLineLabel}>
                        <Ionicons name="flash-outline" size={13} color="#B45309" />
                        <Text style={styles.surgeLineText} numberOfLines={1}>
                          {surge.name}
                        </Text>
                      </View>
                      <Text style={styles.surgeLineValue}>
                        + ₹{Math.round(surge.amount).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ))}
                  {tipAmount > 0 ? (
                    <View style={styles.earningsLine}>
                      <View style={styles.tipLineLabel}>
                        <Ionicons name="gift-outline" size={13} color="#15803D" />
                        <Text style={styles.tipLineText}>
                          {t("orders.incoming.customerTip", "Customer tip")}
                        </Text>
                      </View>
                      <Text style={styles.tipLineValue}>
                        + ₹{tipAmount.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.earningsDividerHorizontal} />
                  <View style={styles.earningsTotalRow}>
                    <Text style={styles.earningsLabel}>
                      {t("orders.incoming.totalEarning", "Total earnings")}
                    </Text>
                    <Text style={styles.earningsValue}>
                      ₹{totalEarning.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.distanceGrid}>
                <DistanceStat
                  label={t("orders.incoming.toPickup", "To pickup")}
                  value={formatDistanceKm(pickupKm)}
                />
                <View style={styles.distanceGridDivider} />
                <DistanceStat
                  label={t("orders.incoming.tripDistance", "Trip")}
                  value={formatDistanceKm(tripKm)}
                />
                <View style={styles.distanceGridDivider} />
                <DistanceStat
                  label={t("orders.incoming.totalDistance", "Overall")}
                  value={formatDistanceKm(totalKm)}
                />
              </View>

              <View style={styles.routeCard}>
                <View style={styles.routeRow}>
                  <View style={styles.routeDotCol}>
                    <View style={[styles.routeDot, styles.pickupDot]} />
                    <View style={styles.routeConnector} />
                  </View>
                  <View style={styles.routeTextWrap}>
                    <View style={styles.routeLabelRow}>
                      <Text style={styles.routeLabel}>
                        {t("orders.incoming.pickup", "Pickup")}
                      </Text>
                      {pickupKm != null && pickupKm > 0 ? (
                        <Text style={styles.routeKmChip}>{formatDistanceKm(pickupKm)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.routeAddress}>
                      {compactAddress(order.pickup.address)}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeRow}>
                  <View style={styles.routeDotCol}>
                    <View style={[styles.routeDot, styles.dropDot]} />
                  </View>
                  <View style={styles.routeTextWrap}>
                    <View style={styles.routeLabelRow}>
                      <Text style={styles.routeLabel}>
                        {t("orders.incoming.drop", "Drop")}
                      </Text>
                      {tripKm != null && tripKm > 0 ? (
                        <Text style={styles.routeKmChip}>{formatDistanceKm(tripKm)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.routeAddress}>
                      {compactAddress(order.delivery.address)}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: footerBottomInset }]}>
              <AcceptRideSwipeButton
                key={order.id}
                loading={loading}
                disabled={secondsLeft <= 0}
                countdown={mmss}
                timeProgress={fuseProgress}
                urgent={fuseUrgent}
                label={acceptLabel}
                resetKey={acceptSwipeResetKey}
                onPress={onAccept}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** @deprecated use IncomingOrderModal */
export const IncomingRideOrderModal = IncomingOrderModal;

/** Tick every 100ms while modal is mounted */
function useStateNow(): [number, () => void] {
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return [nowTick, () => setNowTick(Date.now())];
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
    margin: 0,
    padding: 0,
  },
  dismissArea: { flex: 1 },
  sheetStack: {
    position: "relative",
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
    paddingBottom: 0,
    overflow: "visible",
  },
  /** Porter-style: pill + reject float above sheet top edge */
  sheetOverlapHeader: {
    position: "relative",
    alignSelf: "stretch",
    width: "100%",
    height: BADGE_H,
    marginBottom: -BADGE_OVERLAP,
    zIndex: 30,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 0,
    overflow: "visible",
    ...Platform.select({
      android: { elevation: 16 },
      default: {},
    }),
  },
  badgeFuseShell: {
    width: BADGE_W,
    height: BADGE_H,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  badgeFuseSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  newOrderBadgePill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  newOrderBadgeText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: 0.15,
  },
  newOrderBadgeTextUrgent: {
    color: colors.error[700],
  },
  rejectAnchor: {
    position: "absolute",
    top: -10,
    right: H_PADDING,
    zIndex: 40,
    alignSelf: "flex-end",
    ...Platform.select({
      android: { elevation: 20 },
      default: {},
    }),
  },
  rejectPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  rejectPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
    flexShrink: 0,
    includeFontPadding: false,
  },
  sheet: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    maxHeight: "98%",
    paddingTop: BADGE_OVERLAP + 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  sheetTopCap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: BADGE_OVERLAP + 10,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    zIndex: 1,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 2,
    paddingBottom: 10,
  },
  categoryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.primary[50],
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  categoryBannerText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary[800],
  },
  merchantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
    marginTop: -4,
  },
  merchantName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
    lineHeight: 19,
  },
  itemCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 1,
  },
  itemCountPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary[800],
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  orderId: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.3,
  },
  orderTime: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray[500],
  },
  earningsCard: {
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  earningsBreakdown: {
    gap: 6,
  },
  earningsLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsSubLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
  },
  earningsSubValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[800],
  },
  tipLineLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tipLineText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#15803D",
  },
  tipLineValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803D",
  },
  surgeLineText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B45309",
    flexShrink: 1,
    maxWidth: 180,
  },
  surgeLineValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B45309",
  },
  earningsDividerHorizontal: {
    height: 1,
    backgroundColor: colors.gray[200],
    marginVertical: 2,
  },
  earningsTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.gray[600],
  },
  earningsValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
  },
  distanceGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  distanceStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  distanceStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  distanceStatValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
    marginTop: 4,
    textAlign: "center",
  },
  distanceGridDivider: {
    width: 1,
    backgroundColor: colors.gray[200],
    marginVertical: 2,
  },
  routeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 10,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  routeDotCol: {
    alignItems: "center",
    width: 12,
    paddingTop: 4,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pickupDot: { backgroundColor: colors.success[500] },
  dropDot: { backgroundColor: colors.error[500] },
  routeConnector: {
    width: 2,
    flex: 1,
    minHeight: 28,
    backgroundColor: colors.gray[200],
    marginVertical: 4,
  },
  routeTextWrap: { flex: 1, paddingBottom: 8 },
  routeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  routeKmChip: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary[700],
    backgroundColor: colors.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  routeAddress: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[800],
    marginTop: 3,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: H_PADDING,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
    backgroundColor: "#FFFFFF",
  },
  acceptBtnWrap: {
    width: "100%",
  },
  acceptBtn: {
    height: 52,
    borderRadius: 14,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  acceptProgressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  acceptText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  acceptHandle: {
    position: "absolute",
    left: ACCEPT_HANDLE_INSET,
    top: ACCEPT_HANDLE_INSET,
    width: ACCEPT_HANDLE_W,
    height: 52 - ACCEPT_HANDLE_INSET * 2,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeHintArrows: {
    flexDirection: "row",
    alignItems: "center",
  },
  acceptChevronSecond: {
    marginLeft: -8,
  },
  btnDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
