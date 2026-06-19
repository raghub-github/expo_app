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
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useIncomingOrderSheet } from "@/context/IncomingOrderSheetContext";
import { useOrders, type LineItem, type OrderRecord } from "@/hooks/useOrders";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { patchFoodOrderStatus } from "@/services/ordersApi";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import {
  playIncomingOrderAlert,
  stopOrderAlertSound,
} from "@/lib/playOrderAlertSound";
import { RejectOrderSheet } from "@/components/order/RejectOrderSheet";
import { RejectFollowUpHost, useRejectFollowUp } from "@/components/order/RejectFollowUpHost";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import { IncomingOrderAllItemsSheet } from "@/components/order/IncomingOrderAllItemsSheet";
import { IncomingOrderCustomizationSheet } from "@/components/order/IncomingOrderCustomizationSheet";
import { FormattedOrderId } from "@/components/order/FormattedOrderId";
import { formatPartnerIncomingCustomerLabel } from "@/components/order/orderFormatters";
import { AnimatedPlacedTime } from "@/components/order/AnimatedPlacedTime";
import { lineItemHasCustomizations } from "@/lib/merchant-order-food-item-display";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { formatMerchantRs } from "@/lib/merchant-line-total";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import { rejectReasonNeedsFollowUp } from "@/lib/merchantCancellationReasons";
import {
  acceptSecondsLeft,
  acceptDeadlineMs,
  acceptanceWindowMs,
  AUTO_CANCEL_REASON,
  claimAutoCancelFoodOrder,
  formatAcceptCountdown,
  releaseAutoCancelFoodOrder,
} from "@/lib/orderAcceptanceWindow";
import {
  clampPrepMinutes,
  PLATFORM_DEFAULT_PREP_MINUTES,
  PREP_TIME_MIN,
  PREP_TIME_MAX,
} from "@/lib/order-prep-time";
import * as SecureStore from "expo-secure-store";

const DISMISS_KEY = "merchant_incoming_order_dismissed_v1";
const MAX_PREVIEW_ITEMS = 3;
const PREP_STEP_MINUTES = 5;

function isInvalidTransitionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /invalid transition/i.test(msg);
}

async function getDismissed(): Promise<Set<number>> {
  try {
    const raw = await SecureStore.getItemAsync(DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as Array<{ order_id: number; t: number }>;
    const out = new Set<number>();
    const now = Date.now();
    for (const it of Array.isArray(arr) ? arr : []) {
      if (
        it &&
        typeof it.order_id === "number" &&
        typeof it.t === "number" &&
        now - it.t < 7 * 86400_000
      ) {
        out.add(it.order_id);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

async function addDismissed(orderCoreId: number) {
  const prev = await getDismissed();
  prev.add(orderCoreId);
  const arr = Array.from(prev).map((oid) => ({ order_id: oid, t: Date.now() }));
  await SecureStore.setItemAsync(DISMISS_KEY, JSON.stringify(arr.slice(-200)));
}

const BADGE_W = 168;
const BADGE_H = 42;
const BADGE_STROKE = 4;
/** 20% of pill sits on sheet; 80% floats above (Porter-style). */
const BADGE_OVERLAP = BADGE_H * 0.2;
const URGENT_SECONDS = 60;

/** Pill outline starting at top-center, clockwise — fuse depletes with accept timer. */
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

/** Pill fuse ring — true pill SVG path (no scaleX circle artifact / overlap). */
function NewOrderFusePill({
  borderProgress,
  urgent,
}: {
  borderProgress: number;
  urgent: boolean;
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
  const borderColor = urgent ? "#DC2626" : "#15803D";
  const trackColor = urgent ? "rgba(220, 38, 38, 0.28)" : "rgba(21, 128, 61, 0.24)";
  const inset = BADGE_STROKE / 2;
  const pathD = buildPillOutlinePath(BADGE_W, BADGE_H, inset);
  const pathLen = pillOutlineLength(BADGE_W, BADGE_H, inset);
  /** Same 0→1 progress as accept countdown — ring vanishes as time runs out */
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
          New order!
        </Text>
      </View>
    </Animated.View>
  );
}

const ACCEPT_HANDLE_W = 44;
const ACCEPT_HANDLE_INSET = 6;

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

function AcceptOrderSwipeButton({
  loading,
  disabled,
  countdown,
  timeProgress,
  urgent,
  onPress,
}: {
  loading: boolean;
  disabled: boolean;
  countdown: string;
  /** 0–1 remaining acceptance window — synced with new-order fuse */
  timeProgress: number;
  urgent: boolean;
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

  const confirmSwipe = useCallback(() => {
    if (confirmedRef.current || disabled || loading) return;
    confirmedRef.current = true;
    Vibration.vibrate(15);
    onPress();
    setTimeout(resetDrag, 320);
  }, [disabled, loading, onPress, resetDrag]);

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
        const threshold = max * 0.72;
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

  const accent = urgent ? "#DC2626" : "#16A34A";
  const btnBg = urgent ? "#DC2626" : "#22C55E";

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
          Accept order ({countdown})
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

function openCustomizationSheet(
  item: LineItem,
  setItem: (item: LineItem | null) => void
) {
  if (lineItemHasCustomizations(item)) setItem(item);
}

/**
 * Live incoming order bottom sheet + alert sound (Partner Site parity).
 */
export default function IncomingOrderModal() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { registerOpenHandler } = useIncomingOrderSheet();
  const storeId = selectedStore?.id ?? null;

  const [sheetOrder, setSheetOrder] = useState<OrderRecord | null>(null);
  const { orders, refetch } = useOrders();
  const { settings: acceptanceSettings, acceptanceWindowMinutes } = useOrderAcceptanceSettings();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [allItemsOpen, setAllItemsOpen] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<LineItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [prepMinutes, setPrepMinutes] = useState(PLATFORM_DEFAULT_PREP_MINUTES);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [fuseBaselineMs, setFuseBaselineMs] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();

  const seenFoodIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const shownCoreIdsRef = useRef<Set<string>>(new Set());
  const autoCancelToastShownRef = useRef<number | null>(null);
  const soundPlayedForOrderRef = useRef<string | null>(null);

  const openIfNew = useCallback(
    async (order: OrderRecord) => {
      if (!storeId || !token) return;
      if (order.status !== "created" || order.id.startsWith("core-")) return;

      const dev = await readDeviceOrderAlertsAsync(storeId);
      if (!dev.orderAlertsEnabled) return;

      const dismissed = await getDismissed();
      if (dismissed.has(order.ordersCoreId)) return;

      const dedupeKey = `c:${order.ordersCoreId}`;
      if (shownCoreIdsRef.current.has(dedupeKey)) return;
      shownCoreIdsRef.current.add(dedupeKey);

      const windowMs = Math.max(60_000, acceptanceWindowMs(acceptanceWindowMinutes));
      const age = Date.now() - new Date(order.createdAt).getTime();
      if (age >= windowMs) {
        await addDismissed(order.ordersCoreId);
        return;
      }

      setSheetOrder(order);
      autoCancelToastShownRef.current = null;

      if (soundPlayedForOrderRef.current !== order.id) {
        soundPlayedForOrderRef.current = order.id;
        void playIncomingOrderAlert(acceptanceSettings, dev);
      }
    },
    [storeId, token, acceptanceWindowMinutes, acceptanceSettings]
  );

  const openSheetManually = useCallback(
    (order: OrderRecord) => {
      if (order.status !== "created" || order.id.startsWith("core-")) return;
      setSheetOrder(order);
      autoCancelToastShownRef.current = null;
      const dedupeKey = `c:${order.ordersCoreId}`;
      shownCoreIdsRef.current.add(dedupeKey);
    },
    []
  );

  useEffect(() => {
    if (!sheetOrder) return;
    setPrepMinutes(PLATFORM_DEFAULT_PREP_MINUTES);
  }, [sheetOrder?.id]);

  useEffect(() => {
    registerOpenHandler(openSheetManually);
    return () => registerOpenHandler(null);
  }, [registerOpenHandler, openSheetManually]);

  useEffect(() => {
    if (!sheetOrder || !storeId) return;
    if (soundPlayedForOrderRef.current === sheetOrder.id) return;
    soundPlayedForOrderRef.current = sheetOrder.id;
    let cancelled = false;
    void (async () => {
      const dev = await readDeviceOrderAlertsAsync(storeId);
      if (cancelled) return;
      await playIncomingOrderAlert(acceptanceSettings, dev);
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetOrder?.id, storeId, acceptanceSettings]);

  useEffect(() => {
    if (!storeId || !token) return;
    const created = orders.filter((o) => o.status === "created" && !o.id.startsWith("core-"));
    if (!initializedRef.current) {
      for (const o of created) {
        seenFoodIdsRef.current.add(o.id);
      }
      initializedRef.current = true;
      return;
    }
    if (sheetOrder) return;
    for (const o of created) {
      if (seenFoodIdsRef.current.has(o.id)) continue;
      seenFoodIdsRef.current.add(o.id);
      void openIfNew(o);
      break;
    }
  }, [orders, storeId, token, sheetOrder, openIfNew]);

  useEffect(() => {
    if (!sheetOrder) {
      setFuseBaselineMs(0);
      return;
    }
    const deadline = acceptDeadlineMs(sheetOrder.createdAt, acceptanceWindowMinutes);
    setFuseBaselineMs(Math.max(1000, deadline - Date.now()));
  }, [sheetOrder?.id, sheetOrder?.createdAt, acceptanceWindowMinutes]);

  useEffect(() => {
    if (!sheetOrder) return;
    const t = setInterval(() => setNowTick(Date.now()), 100);
    return () => clearInterval(t);
  }, [sheetOrder]);

  const secondsLeft = useMemo(() => {
    if (!sheetOrder) return 0;
    return acceptSecondsLeft(sheetOrder.createdAt, acceptanceWindowMinutes, nowTick);
  }, [sheetOrder, acceptanceWindowMinutes, nowTick]);

  const mmss = useMemo(() => formatAcceptCountdown(secondsLeft), [secondsLeft]);
  /** 1 when modal opens → 0 when accept timer hits zero (visible live fuse) */
  const fuseProgress = useMemo(() => {
    if (!sheetOrder || fuseBaselineMs <= 0) return 1;
    const deadline = acceptDeadlineMs(sheetOrder.createdAt, acceptanceWindowMinutes);
    const msLeft = Math.max(0, deadline - nowTick);
    return Math.min(1, msLeft / fuseBaselineMs);
  }, [sheetOrder, fuseBaselineMs, acceptanceWindowMinutes, nowTick]);
  const fuseUrgent = secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

  const displayOrder = useMemo(() => {
    if (!sheetOrder) return null;
    return (
      orders.find((o) => o.id === sheetOrder.id) ??
      orders.find((o) => o.ordersCoreId === sheetOrder.ordersCoreId) ??
      sheetOrder
    );
  }, [sheetOrder, orders]);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message });
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: "" });
      toastTimerRef.current = null;
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const minimizeSheet = useCallback(() => {
    stopOrderAlertSound();
    setSheetOrder(null);
    setRejectOpen(false);
    setAllItemsOpen(false);
    setCustomizationItem(null);
    void refetch();
  }, [refetch]);

  const dismissSheet = useCallback(async () => {
    stopOrderAlertSound();
    soundPlayedForOrderRef.current = null;
    if (sheetOrder) await addDismissed(sheetOrder.ordersCoreId);
    setSheetOrder(null);
    setRejectOpen(false);
    setAllItemsOpen(false);
    setCustomizationItem(null);
    void refetch();
  }, [sheetOrder, refetch]);

  const patchStatus = useCallback(
    async (
      status: "ACCEPTED" | "CANCELLED",
      extra?: { rejected_reason?: string; preparation_time_minutes?: number },
      mode: "auto" | "manual" = "manual"
    ) => {
      if (!storeId || !token || !sheetOrder || sheetOrder.id.startsWith("core-")) return;
      const foodId = parseInt(sheetOrder.id, 10);
      if (!Number.isFinite(foodId)) return;
      setActionLoading(true);
      try {
        await patchFoodOrderStatus(storeId, foodId, token, status, extra?.rejected_reason, {
          action_source: "app",
          ...(status === "ACCEPTED"
            ? {
                accept_mode: mode,
                preparation_time_minutes: extra?.preparation_time_minutes ?? prepMinutes,
              }
            : {}),
          ...(status === "CANCELLED" ? { cancel_mode: mode } : {}),
        });
        if (status === "CANCELLED" && mode === "auto") {
          showToast("Order cancelled");
        }
        await dismissSheet();
      } catch (err) {
        if (status === "CANCELLED" && isInvalidTransitionError(err)) {
          if (mode === "auto") showToast("Order cancelled");
          await dismissSheet();
        } else if (status === "CANCELLED" && mode === "auto") {
          releaseAutoCancelFoodOrder(foodId);
        }
      } finally {
        setActionLoading(false);
      }
    },
    [storeId, token, sheetOrder, dismissSheet, showToast, prepMinutes]
  );

  const stepPrep = useCallback((delta: number) => {
    setPrepMinutes((prev) =>
      clampPrepMinutes(prev + delta, PLATFORM_DEFAULT_PREP_MINUTES)
    );
  }, []);

  useEffect(() => {
    if (!sheetOrder) return;
    const liveById = orders.find((o) => o.id === sheetOrder.id);
    const liveByCore = orders.find((o) => o.ordersCoreId === sheetOrder.ordersCoreId);
    const live = liveById ?? liveByCore;
    if (!live || live.status !== "created") {
      void dismissSheet();
    }
  }, [orders, sheetOrder, dismissSheet]);

  useEffect(() => {
    if (!sheetOrder) return;
    if (actionLoading || secondsLeft > 0) return;
    const foodId = parseInt(sheetOrder.id, 10);
    if (!Number.isFinite(foodId)) return;
    if (!claimAutoCancelFoodOrder(foodId)) {
      if (autoCancelToastShownRef.current !== sheetOrder.ordersCoreId) {
        autoCancelToastShownRef.current = sheetOrder.ordersCoreId;
        showToast("Order cancelled");
      }
      void dismissSheet();
      return;
    }
    void patchStatus("CANCELLED", { rejected_reason: AUTO_CANCEL_REASON }, "auto");
  }, [secondsLeft, sheetOrder, actionLoading, patchStatus, dismissSheet, showToast]);

  if (!storeId) return null;

  const order = displayOrder;
  const sheetVisible = !!order && !rejectOpen && !allItemsOpen && !customizationItem;
  const lineItems = order?.lineItems ?? [];
  const previewItems = lineItems.slice(0, MAX_PREVIEW_ITEMS);
  const moreCount = Math.max(0, lineItems.length - MAX_PREVIEW_ITEMS);
  const itemCount = lineItems.reduce((s, it) => s + Math.max(1, it.qty || 1), 0);

  const customerLabel = order
    ? formatPartnerIncomingCustomerLabel(
        order.customerName,
        order.customerStoreOrderOrdinal,
        order.customerStoreOrdersTotal
      )
    : "";

  return (
    <>
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => minimizeSheet()}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.dismissArea} onPress={() => minimizeSheet()} />

          {order ? (
            <Pressable
              onPress={() => minimizeSheet()}
              style={[styles.minimizeBtn, { top: insets.top + 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Close incoming order sheet"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}

          <View style={styles.sheetStack}>
            {order ? (
              <>
                <View style={styles.sheetOverlapHeader} pointerEvents="box-none">
                  <NewOrderFusePill borderProgress={fuseProgress} urgent={fuseUrgent} />
                  <Pressable
                    onPress={() => setRejectOpen(true)}
                    disabled={actionLoading}
                    style={({ pressed }) => [
                      styles.rejectPill,
                      actionLoading && styles.btnDisabled,
                      pressed && styles.pressed,
                    ]}
                    hitSlop={8}
                  >
                    <Text style={styles.rejectPillText}>Reject</Text>
                    <Ionicons name="close" size={14} color="#EF4444" />
                  </Pressable>
                </View>

                <View style={styles.sheet}>
                <View style={styles.sheetTopCap} pointerEvents="none" />
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.bodyContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <View style={styles.deliveryBanner}>
                    <Ionicons name="bicycle-outline" size={14} color={GatiMitraMerchant.primaryDark} />
                    <Text style={styles.deliveryBannerText}>GatiMitra delivery</Text>
                  </View>

                  <View style={styles.orderMetaRow}>
                    <FormattedOrderId
                      formattedOrderId={order.formattedOrderId}
                      fallbackCoreId={order.ordersCoreId}
                      fallbackFoodId={parseInt(order.id, 10) || undefined}
                      size="lg"
                    />
                    <AnimatedPlacedTime
                      createdAt={order.createdAt}
                      nowMs={nowTick}
                      style={styles.orderTime}
                    />
                  </View>

                  <Text style={styles.customerName}>{customerLabel}</Text>

                  {order.isBulkOrder ? (
                    <View style={styles.bulkBanner}>
                      <Ionicons name="time-outline" size={18} color="#B45309" />
                      <View style={styles.bulkTextWrap}>
                        <Text style={styles.bulkTitle}>Big order</Text>
                        <Text style={styles.bulkSub}>Allow extra prep time before accepting.</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.earningsCard}>
                    <View style={styles.earningsMain}>
                      <Text style={styles.earningsLabel}>Order value</Text>
                      <Text style={styles.earningsValue}>
                        {formatMerchantRs(order.total)}
                      </Text>
                    </View>
                    <View style={styles.earningsDivider} />
                    <View style={styles.earningsMeta}>
                      <Text style={styles.earningsMetaLabel}>Items</Text>
                      <Text style={styles.earningsMetaValue}>{itemCount}</Text>
                    </View>
                    {order.distanceKm != null && order.distanceKm > 0 ? (
                      <>
                        <View style={styles.earningsDivider} />
                        <View style={styles.earningsMeta}>
                          <Text style={styles.earningsMetaLabel}>Distance</Text>
                          <Text style={styles.earningsMetaValue}>{order.distanceKm.toFixed(1)} km</Text>
                        </View>
                      </>
                    ) : null}
                  </View>

                  {order.dropAddress ? (
                    <View style={styles.addressCard}>
                      <Ionicons name="location-outline" size={16} color={GatiMitraMerchant.textSecondary} />
                      <Text style={styles.addressText} numberOfLines={3}>
                        {compactAddress(order.dropAddress)}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.itemsHeaderRow}>
                    <Text style={styles.itemsHeading}>Order items</Text>
                    {lineItems.length > 0 ? (
                      <Pressable onPress={() => setAllItemsOpen(true)} hitSlop={8}>
                        <Text style={styles.viewAllLink}>View all</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.itemsCard}>
                    {previewItems.length === 0 ? (
                      <Text style={styles.emptyItems}>No items listed.</Text>
                    ) : (
                      previewItems.map((item, idx) => (
                        <View
                          key={`${item.name}-${idx}`}
                          style={[styles.itemRowWrap, idx < previewItems.length - 1 && styles.itemRowBorder]}
                        >
                          <OrderCardItemRow
                            item={item}
                            orderVeg={order.vegNonVeg}
                            showPrice
                            showExpandChevron
                            onItemNamePress={() => openCustomizationSheet(item, setCustomizationItem)}
                            onRowPress={() => openCustomizationSheet(item, setCustomizationItem)}
                          />
                        </View>
                      ))
                    )}
                  </View>

                  {moreCount > 0 ? (
                    <Pressable
                      onPress={() => setAllItemsOpen(true)}
                      style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
                    >
                      <Text style={styles.moreRowText}>+{moreCount} more in list</Text>
                      <Text style={styles.moreRowLink}>View all</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>

                <View style={styles.prepSection}>
                  <Text style={styles.prepTitle}>Preparation time</Text>
                  <Text style={styles.prepHint}>
                    {PREP_TIME_MIN}–{PREP_TIME_MAX} min · shown to customer
                  </Text>
                  <View style={styles.prepRow}>
                    <Pressable
                      style={[styles.prepBtn, prepMinutes <= PREP_TIME_MIN && styles.prepBtnDisabled]}
                      disabled={prepMinutes <= PREP_TIME_MIN || actionLoading}
                      onPress={() => stepPrep(-PREP_STEP_MINUTES)}
                    >
                      <Text style={styles.prepBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.prepValue}>{prepMinutes} mins</Text>
                    <Pressable
                      style={[styles.prepBtn, prepMinutes >= PREP_TIME_MAX && styles.prepBtnDisabled]}
                      disabled={prepMinutes >= PREP_TIME_MAX || actionLoading}
                      onPress={() => stepPrep(PREP_STEP_MINUTES)}
                    >
                      <Text style={styles.prepBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
                  <AcceptOrderSwipeButton
                    loading={actionLoading}
                    disabled={secondsLeft <= 0}
                    countdown={mmss}
                    timeProgress={fuseProgress}
                    urgent={fuseUrgent}
                    onPress={() =>
                      void patchStatus("ACCEPTED", { preparation_time_minutes: prepMinutes }, "manual")
                    }
                  />
                </View>
              </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {order ? (
        <>
          <IncomingOrderAllItemsSheet
            visible={allItemsOpen}
            items={lineItems}
            total={order.total}
            orderVeg={order.vegNonVeg}
            onClose={() => setAllItemsOpen(false)}
            onItemPress={(item) => openCustomizationSheet(item, setCustomizationItem)}
          />

          <IncomingOrderCustomizationSheet
            visible={customizationItem != null}
            item={customizationItem}
            orderVeg={order.vegNonVeg}
            onClose={() => setCustomizationItem(null)}
          />

          <RejectOrderSheet
            visible={rejectOpen}
            formattedOrderId={order.formattedOrderId}
            fallbackOrderId={order.ordersCoreId}
            loading={actionLoading}
            onClose={() => setRejectOpen(false)}
            onConfirm={(reason: MerchantCancellationReason) => {
              if (!order) return;
              const snap = order;
              setRejectOpen(false);
              if (rejectReasonNeedsFollowUp(reason)) {
                beginFollowUp(reason, snap.lineItems, async () => {
                  const foodId = parseInt(snap.id, 10);
                  if (!storeId || !token || !Number.isFinite(foodId)) return;
                  try {
                    await patchFoodOrderStatus(storeId, foodId, token, "CANCELLED", reason, {
                      action_source: "app",
                      cancel_mode: "manual",
                    });
                  } catch (err) {
                    if (!isInvalidTransitionError(err)) throw err;
                  }
                  await dismissSheet();
                });
                return;
              }
              void (async () => {
                setActionLoading(true);
                try {
                  const foodId = parseInt(snap.id, 10);
                  if (!storeId || !token || !Number.isFinite(foodId)) return;
                  await patchFoodOrderStatus(storeId, foodId, token, "CANCELLED", reason, {
                    action_source: "app",
                    cancel_mode: "manual",
                  });
                  await dismissSheet();
                } catch (err) {
                  if (!isInvalidTransitionError(err)) {
                    /* list refresh will reconcile */
                  } else {
                    await dismissSheet();
                  }
                } finally {
                  setActionLoading(false);
                }
              })();
            }}
          />
        </>
      ) : null}

      <RejectFollowUpHost
        followUp={followUp}
        onDismiss={dismissFollowUp}
        setFollowUp={setFollowUp}
      />

      {toast.visible ? (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.toastOverlay} pointerEvents="none">
            <View style={styles.toast}>
              <Ionicons name="close-circle" size={18} color="#FFFFFF" />
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
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
  minimizeBtn: {
    position: "absolute",
    right: H_PADDING,
    zIndex: 40,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheetStack: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
    paddingBottom: 0,
    overflow: "visible",
  },
  /** Porter-style: pill + reject float above sheet top edge */
  sheetOverlapHeader: {
    position: "relative",
    height: BADGE_H,
    marginBottom: -BADGE_OVERLAP,
    zIndex: 30,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 0,
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
    color: "#111827",
    letterSpacing: 0.15,
  },
  newOrderBadgeTextUrgent: {
    color: "#B91C1C",
  },
  rejectPill: {
    position: "absolute",
    /** Float above sheet — negative top lifts it clear of the sheet edge */
    top: -10,
    right: H_PADDING,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    zIndex: 11,
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
    paddingTop: BADGE_OVERLAP + 10,
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
  /** Solid white under pill overlap — removes grey shadow band at sheet top */
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
  body: { maxHeight: 600 },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 16,
  },
  deliveryBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  deliveryBannerText: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraMerchant.primaryDark,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  orderTime: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  customerName: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 21,
  },
  bulkBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  bulkTextWrap: { flex: 1 },
  bulkTitle: { fontSize: 14, fontWeight: "800", color: "#92400E" },
  bulkSub: { fontSize: 12, color: "#B45309", marginTop: 2, lineHeight: 16 },
  earningsCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  earningsMain: { flex: 1.2 },
  earningsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  earningsDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.border,
    marginHorizontal: 10,
  },
  earningsMeta: { flex: 0.8, alignItems: "center" },
  earningsMetaLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  earningsMetaValue: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 2,
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 19,
  },
  itemsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  itemsHeading: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  viewAllLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  itemsCard: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  itemRowWrap: { paddingHorizontal: 12, paddingVertical: 10 },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  emptyItems: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    padding: 14,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  moreRowText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  moreRowLink: { fontSize: 12, fontWeight: "800", color: "#2563EB" },
  prepSection: {
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
  },
  prepTitle: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  prepHint: { fontSize: 11, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  prepRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  prepBtn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  prepBtnDisabled: { opacity: 0.4 },
  prepBtnText: { fontSize: 20, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  prepValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 10,
  },
  footer: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    width: "100%",
  },
  acceptBtnWrap: {
    width: "100%",
  },
  acceptBtn: {
    width: "100%",
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  acceptProgressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
  },
  acceptBtnPressed: {
    backgroundColor: "#16A34A",
  },
  acceptHandle: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  acceptChevronSecond: {
    marginLeft: -10,
  },
  swipeHintArrows: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
    zIndex: 1,
  },
  btnDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.88 },
  toastOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 72,
    backgroundColor: "transparent",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#991B1B",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    maxWidth: "90%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  toastText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
