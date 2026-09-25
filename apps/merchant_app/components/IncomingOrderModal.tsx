import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  Dimensions,
  PanResponder,
  Vibration,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
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
import { fetchFoodOrder, syncAcceptanceTimeout } from "@/services/ordersApi";
import { isAppForeground } from "@/lib/appForeground";
import { setCachedFoodOrder } from "@/lib/foodOrderCache";
import { mapApiOrder } from "@/lib/orderRecord";
import { shortLocalityFromAddress } from "@/lib/selectedStoreStorage";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import {
  takeoverNewOrderAlertByModal,
  stopNewOrderAlert,
  peekNewOrderAlertSessionId,
} from "@/lib/newOrderAlertManager";
import { RejectOrderSheet } from "@/components/order/RejectOrderSheet";
import { RejectFollowUpHost, useRejectFollowUp } from "@/components/order/RejectFollowUpHost";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import { IncomingOrderAllItemsSheet } from "@/components/order/IncomingOrderAllItemsSheet";
import { MerchantIncomingBillCard } from "@/components/order/MerchantIncomingBillCard";
import { IncomingOrderBillBreakdownSheet } from "@/components/order/IncomingOrderBillBreakdownSheet";
import {
  IncomingDeliveryBanner,
  type IncomingBannerSlide,
} from "@/components/order/IncomingDeliveryBanner";
import { parseMerchantInstructionsList } from "@/lib/merchant-order-instructions";
import { isPrepaidOrder } from "@/lib/merchant-order-payment";
import { IncomingOrderCustomizationSheet } from "@/components/order/IncomingOrderCustomizationSheet";
import { FormattedOrderId } from "@/components/order/FormattedOrderId";
import { formatPartnerIncomingCustomerLabel } from "@/components/order/orderFormatters";
import { AnimatedPlacedTime } from "@/components/order/AnimatedPlacedTime";
import { lineItemHasKitchenDetails } from "@/lib/merchant-order-food-item-display";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, HEADER_HEIGHT } from "@/constants/theme";
import { merchantIncomingBillPartsFromOrder } from "@/lib/resolveMerchantOrderTotal";
import { requestMerchantDashboardStatsRefresh } from "@/lib/merchantDashboardStatsBus";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import { rejectReasonNeedsFollowUp } from "@/lib/merchantCancellationReasons";
import {
  acceptSecondsLeft,
  acceptDeadlineMs,
  formatAcceptCountdown,
} from "@/lib/orderAcceptanceWindow";
import {
  clampPrepMinutes,
  PLATFORM_DEFAULT_PREP_MINUTES,
  PREP_TIME_MIN,
  PREP_TIME_MAX,
  resolveStoreDefaultPrepMinutes,
} from "@/lib/order-prep-time";
import { TypographyVariantProvider } from "@/lib/typographyVariant";
import { MerchantFonts } from "@/constants/typography";
import { getTextHost } from "@/lib/textHost";
import { fetchStoreProfile } from "@/services/menuApi";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import * as SecureStore from "expo-secure-store";
import {
  hydrateIncomingOrderDismissedLocal,
  isIncomingOrderResolved,
  markIncomingOrderDismissedLocal,
  markIncomingOrderResolved,
} from "@/lib/incomingOrderDismissed";

const NativeText = getTextHost();

function rejectFlowLog(step: string, orderId: string, alertSessionId: string): void {
  console.log(`[REJECT_FLOW] ${step}`, {
    timestamp: Date.now(),
    orderId,
    alertSessionId,
  });
}

// v3: clear prior dismiss poison (v1 auto-dismissed on list flicker; v2 still
 // blocked re-open after a failed board hydrate). Fresh devices always show the
 // accept sheet for still-CREATED orders inside the acceptance window.
const DISMISS_KEY = "merchant_incoming_order_dismissed_v3";
const MAX_PREVIEW_ITEMS = 3;
const PREP_STEP_MINUTES = 5;

/** Oldest CREATED food order first — merchant must clear backlog FIFO. */
function pendingCreatedFifo(orders: OrderRecord[]): OrderRecord[] {
  return orders
    .filter((o) => o.status === "created" && !o.id.startsWith("core-"))
    .filter((o) => !isIncomingOrderResolved(o.ordersCoreId, o.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

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

/** In-memory dismiss helpers — X / accept poison before SecureStore round-trip. */
function isDismissedCore(orderCoreId: number, foodId?: string | null): boolean {
  return isIncomingOrderResolved(orderCoreId, foodId);
}

async function addDismissed(orderCoreId: number) {
  const id = Number(orderCoreId);
  if (!Number.isFinite(id)) return;
  markIncomingOrderDismissedLocal(id);
  const prev = await getDismissed();
  prev.add(id);
  const arr = Array.from(prev).map((oid) => ({ order_id: oid, t: Date.now() }));
  await SecureStore.setItemAsync(DISMISS_KEY, JSON.stringify(arr.slice(-200)));
}

const BADGE_W = 168;
const BADGE_H = 42;
const BADGE_STROKE = 4;
/** 20% of pill sits on sheet; 80% floats above (Porter-style). */
const BADGE_OVERLAP = BADGE_H * 0.2;
const URGENT_SECONDS = 120;

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
        <Text
          style={[styles.newOrderBadgeText, urgent && styles.newOrderBadgeTextUrgent]}
          maxFontSizeMultiplier={1.2}
        >
          New order!
        </Text>
      </View>
    </Animated.View>
  );
}

/** Match rider `slideAction` track / thumb (visual only — merchant fuse timing unchanged). */
const SLIDE_TRACK_H = 66;
const SLIDE_THUMB_W = 64;
const SLIDE_THUMB_H = 52;
const SLIDE_PAD = 7;
const SLIDE_ACTION_GREEN = "#7CFF2E";
const SLIDE_ACTION_GREEN_BORDER = "#111111";
const SLIDE_ACTION_LABEL = "#0B1A0F";
const SLIDE_ACTION_THUMB_BG = "#0B1220";
const SLIDE_ACTION_THUMB_ICON = "#FFFFFF";
const SLIDE_ACTION_URGENT = "#EF4444";
const SLIDE_ACTION_URGENT_BORDER = "#7F1D1D";
/** Confirm only on finger-up past ~85% — sliding back cancels. */
const ACCEPT_SWIPE_RATIO = 0.85;

function SwipeHintArrow({ color }: { color: string }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulse]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View style={arrowStyle}>
      <Ionicons name="arrow-forward" size={22} color={color} />
    </Animated.View>
  );
}

function AcceptOrderSwipeButton({
  loading,
  disabled,
  countdown,
  timeProgress,
  remainingMs,
  urgent,
  orderKey,
  onPress,
}: {
  loading: boolean;
  disabled: boolean;
  countdown: string;
  /** 0–1 remaining acceptance window — synced with new-order fuse */
  timeProgress: number;
  remainingMs: number;
  urgent: boolean;
  /** Resets the track when the merchant pages to another pending order. */
  orderKey: string;
  onPress: () => void;
}) {
  const trackWidth = useRef(0);
  const trackWidthSv = useSharedValue(0);
  const dragX = useSharedValue(0);
  const confirmedRef = useRef(false);
  const btnPulse = useSharedValue(1);
  const progressWidth = useSharedValue(timeProgress * 100);
  const liveRef = useRef<{
    loading: boolean;
    disabled: boolean;
    onPress: () => void;
    confirm: () => void;
    reset: () => void;
    max: () => number;
  }>({
    loading,
    disabled,
    onPress,
    confirm: () => {},
    reset: () => {},
    max: () => 0,
  });
  liveRef.current.loading = loading;
  liveRef.current.disabled = disabled;
  liveRef.current.onPress = onPress;

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
    const start = Math.max(0, Math.min(100, timeProgress * 100));
    progressWidth.value = start;
    if (start > 0 && remainingMs > 0) {
      progressWidth.value = withTiming(0, {
        duration: remainingMs,
        easing: Easing.linear,
      });
    }
    // Restart only when the merchant pages to another order — not on the 1s label tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, progressWidth]);

  useEffect(() => {
    confirmedRef.current = false;
    dragX.value = 0;
  }, [orderKey, dragX]);

  const resetDrag = useCallback(() => {
    confirmedRef.current = false;
    dragX.value = withTiming(0, { duration: 140 });
  }, [dragX]);

  const maxTravel = useCallback(
    () => Math.max(0, trackWidth.current - SLIDE_THUMB_W - SLIDE_PAD * 2),
    []
  );

  /** Confirm only when the finger lifts past the threshold — sliding back resets. */
  const confirmSwipe = useCallback(() => {
    const { loading: isLoading, disabled: isDisabled, onPress: press } = liveRef.current;
    if (confirmedRef.current || isDisabled || isLoading) return;
    confirmedRef.current = true;
    Vibration.vibrate(15);
    press();
    dragX.value = withTiming(maxTravel(), { duration: 90 });
  }, [dragX, maxTravel]);

  liveRef.current.confirm = confirmSwipe;
  liveRef.current.reset = resetDrag;
  liveRef.current.max = maxTravel;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        !liveRef.current.disabled && !liveRef.current.loading,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !liveRef.current.disabled && !liveRef.current.loading && Math.abs(gesture.dx) > 2,
      onPanResponderMove: (_, gesture) => {
        if (confirmedRef.current || liveRef.current.disabled || liveRef.current.loading) return;
        const max = liveRef.current.max();
        const next = Math.min(max, Math.max(0, gesture.dx));
        dragX.value = next;
        // Never accept mid-drag — only on release.
      },
      onPanResponderRelease: (_, gesture) => {
        if (confirmedRef.current) return;
        const max = liveRef.current.max();
        const atEnd =
          !liveRef.current.disabled &&
          !liveRef.current.loading &&
          max > 0 &&
          gesture.dx >= max * ACCEPT_SWIPE_RATIO;
        if (atEnd) {
          liveRef.current.confirm();
          return;
        }
        liveRef.current.reset();
      },
      onPanResponderTerminate: () => {
        if (!confirmedRef.current) liveRef.current.reset();
      },
    })
  ).current;

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnPulse.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: Math.max(0, (progressWidth.value / 100) * trackWidthSv.value),
  }));

  const handleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));

  const trackBg = urgent ? SLIDE_ACTION_URGENT : SLIDE_ACTION_GREEN;
  const trackBorder = urgent ? SLIDE_ACTION_URGENT_BORDER : SLIDE_ACTION_GREEN_BORDER;
  const labelColor = urgent ? "#FFFFFF" : SLIDE_ACTION_LABEL;
  const thumbIcon = SLIDE_ACTION_THUMB_ICON;

  return (
    <Animated.View style={[styles.acceptBtnWrap, wrapStyle]}>
      {/* Drag starts anywhere on the track — grabbing the small handle wasted seconds. */}
      <View
        style={[
          styles.acceptBtn,
          { backgroundColor: trackBg, borderColor: trackBorder },
          disabled && styles.btnDisabled,
        ]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWidth.current = w;
          trackWidthSv.value = w;
        }}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.acceptProgressFill,
            { backgroundColor: urgent ? "rgba(255,255,255,0.16)" : "rgba(11,26,15,0.10)" },
            progressStyle,
          ]}
        />
        <NativeText
          style={[
            styles.acceptText,
            {
              color: labelColor,
              fontFamily: MerchantFonts.poppinsBold,
              fontWeight: "900",
            },
          ]}
          pointerEvents="none"
          numberOfLines={1}
          allowFontScaling={false}
        >
          {loading ? "Accepting..." : `Accept order (${countdown})`}
        </NativeText>
        <Animated.View
          style={[styles.acceptHandle, handleStyle]}
          pointerEvents="none"
        >
          {loading ? (
            <ActivityIndicator color={thumbIcon} size="small" />
          ) : (
            <SwipeHintArrow color={thumbIcon} />
          )}
        </Animated.View>
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
  if (lineItemHasKitchenDetails(item)) setItem(item);
}

/**
 * Live incoming order bottom sheet + alert sound (Partner Site parity).
 */
export default function IncomingOrderModal() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore, managedStores } = useSelectedStore();
  const {
    registerOpenHandler,
    registerRescanHandler,
    setSheetOpen,
    parked,
    setParked,
  } = useIncomingOrderSheet();
  const parkedRef = useRef(parked);
  parkedRef.current = parked;
  const storeId = selectedStore?.id ?? null;

  const [sheetOrder, setSheetOrder] = useState<OrderRecord | null>(null);
  const sheetOrderRef = useRef<OrderRecord | null>(null);
  sheetOrderRef.current = sheetOrder;
  const { orders, upsertOrder, transitionOrder, getOrdersSnapshot } = useOrders();
  const { settings: acceptanceSettings, acceptanceWindowMinutes } = useOrderAcceptanceSettings();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [allItemsOpen, setAllItemsOpen] = useState(false);
  const [billBreakdownOpen, setBillBreakdownOpen] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<LineItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectingFoodId, setRejectingFoodId] = useState<string | null>(null);
  const rejectingFoodIdRef = useRef<string | null>(null);
  rejectingFoodIdRef.current = rejectingFoodId;
  const [prepMinutes, setPrepMinutes] = useState(PLATFORM_DEFAULT_PREP_MINUTES);
  const storeDefaultPrepRef = useRef(PLATFORM_DEFAULT_PREP_MINUTES);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [fuseBaselineMs, setFuseBaselineMs] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();

  const seenFoodIdsRef = useRef<Set<string>>(new Set());
  const shownCoreIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void getDismissed().then((set) => {
      hydrateIncomingOrderDismissedLocal(set);
    });
  }, []);

  const openIfNew = useCallback(
    async (order: OrderRecord) => {
      if (!storeId || !token) return;
      if (order.status !== "created" || order.id.startsWith("core-")) return;
      if (isDismissedCore(order.ordersCoreId)) return;
      // Multi-order queue: X parks auto-popup until the floating bell clears it.
      if (parkedRef.current && pendingCreatedFifo(orders).length > 1) return;

      // Session + persistent dedupe — never re-pop an order already shown/dismissed.
      const dedupeKey = `c:${order.ordersCoreId}`;
      if (shownCoreIdsRef.current.has(dedupeKey)) return;
      const dismissed = await getDismissed();
      if (dismissed.has(order.ordersCoreId)) {
        markIncomingOrderDismissedLocal(order.ordersCoreId);
        return;
      }

      // Suppress ONLY orders whose acceptance window is genuinely, finitely over.
      // A NaN/bogus deadline must never hide a fresh order.
      const deadline = acceptDeadlineMs(
        order.createdAt,
        acceptanceWindowMinutes,
        order.merchantResponseDeadlineAt
      );
      if (Number.isFinite(deadline) && Date.now() >= deadline) {
        await addDismissed(order.ordersCoreId);
        return;
      }

      shownCoreIdsRef.current.add(dedupeKey);
      seenFoodIdsRef.current.add(order.id);

      // Already viewing a pending card — keep oldest on screen; new order is Next.
      if (sheetOrderRef.current) {
        return;
      }

      // Always land on the oldest still-pending order (FIFO). A push for a newer
      // order must not jump the merchant past an older unaccepted card.
      const fifo = pendingCreatedFifo(orders);
      const hasIncoming = fifo.some(
        (o) => o.id === order.id || o.ordersCoreId === order.ordersCoreId
      );
      const queue = hasIncoming
        ? fifo
        : [...fifo, order].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
      const target = queue[0] ?? order;
      setSheetOrder(target);
    },
    [storeId, token, acceptanceWindowMinutes, orders]
  );

  const openSheetManually = useCallback(
    (order: OrderRecord) => {
      if (order.status !== "created" || order.id.startsWith("core-")) return;
      if (isDismissedCore(order.ordersCoreId)) return;
      setParked(false);
      const dedupeKey = `c:${order.ordersCoreId}`;
      shownCoreIdsRef.current.add(dedupeKey);
      seenFoodIdsRef.current.add(order.id);

      // Sheet already showing an older pending order — keep FIFO; new order is Next.
      const current = sheetOrderRef.current;
      if (
        current &&
        current.status === "created" &&
        !current.id.startsWith("core-")
      ) {
        return;
      }

      const fifo = pendingCreatedFifo(orders);
      const hasIncoming = fifo.some(
        (o) => o.id === order.id || o.ordersCoreId === order.ordersCoreId
      );
      const queue = hasIncoming
        ? fifo.filter((o) => !isDismissedCore(o.ordersCoreId))
        : [...fifo, order]
            .filter((o) => !isDismissedCore(o.ordersCoreId))
            .sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
      const target = queue[0] ?? order;
      if (isDismissedCore(target.ordersCoreId)) return;
      setSheetOrder(target);
    },
    [setParked, orders]
  );

  /** Floating pill: clear park + open the oldest still-CREATED, non-dismissed order. */
  const rescanParkedOrders = useCallback(async () => {
    setParked(false);
    const created = pendingCreatedFifo(orders);
    const dismissed = await getDismissed();
    hydrateIncomingOrderDismissedLocal(dismissed);
    const target = created.find((o) => !isDismissedCore(o.ordersCoreId));
    if (!target) return;
    shownCoreIdsRef.current.delete(`c:${target.ordersCoreId}`);
    seenFoodIdsRef.current.delete(target.id);
    setSheetOrder(target);
    shownCoreIdsRef.current.add(`c:${target.ordersCoreId}`);
    seenFoodIdsRef.current.add(target.id);
  }, [orders, setParked]);

  useEffect(() => {
    if (!sheetOrder) return;
    setPrepMinutes(storeDefaultPrepRef.current);
  }, [sheetOrder?.id]);

  useEffect(() => {
    if (!selectedStore?.store_id || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await fetchStoreProfile(selectedStore.store_id, token);
        if (cancelled) return;
        const def = resolveStoreDefaultPrepMinutes(profile.avg_preparation_time_minutes);
        storeDefaultPrepRef.current = def;
        setPrepMinutes((prev) =>
          sheetOrderRef.current ? def : prev === PLATFORM_DEFAULT_PREP_MINUTES ? def : prev
        );
      } catch {
        /* keep platform default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStore?.store_id, token]);

  useEffect(() => {
    setSheetOpen(!!sheetOrder);
  }, [sheetOrder, setSheetOpen]);

  useEffect(() => {
    registerOpenHandler(openSheetManually);
    return () => registerOpenHandler(null);
  }, [registerOpenHandler, openSheetManually]);

  useEffect(() => {
    registerRescanHandler(rescanParkedOrders);
    return () => registerRescanHandler(null);
  }, [registerRescanHandler, rescanParkedOrders]);

  useEffect(() => {
    if (!sheetOrder || !storeId) return;
    // Never restart chime for an order the merchant already resolved/dismissed.
    if (isDismissedCore(sheetOrder.ordersCoreId)) return;
    let cancelled = false;
    void (async () => {
      const dev = await readDeviceOrderAlertsAsync(storeId);
      if (cancelled) return;
      if (isDismissedCore(sheetOrder.ordersCoreId)) return;
      await takeoverNewOrderAlertByModal({
        orderId: sheetOrder.id,
        source: "MODAL",
        settings: acceptanceSettings,
        device: dev,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetOrder?.id, storeId, acceptanceSettings]);

  useEffect(() => {
    const created = pendingCreatedFifo(orders);
    if (created.length <= 1 && parked) {
      setParked(false);
    }
  }, [orders, parked, setParked]);

  useEffect(() => {
    if (!storeId || !token) return;
    if (sheetOrder) return;
    const created = pendingCreatedFifo(orders);
    if (created.length === 0) return;
    // Park only applies when 2+ orders are waiting — a single pending order always
    // gets the incoming sheet on cold start / push (unless permanently dismissed).
    if (parked && created.length > 1) return;
    // Surface the oldest still-actionable pending order FIRST (FIFO), including
    // orders that were already CREATED when the app mounted / resumed.
    for (const o of created) {
      if (seenFoodIdsRef.current.has(o.id)) continue;
      if (isDismissedCore(o.ordersCoreId)) continue;
      void openIfNew(o);
      break;
    }
  }, [orders, storeId, token, sheetOrder, openIfNew, parked]);

  useEffect(() => {
    if (!sheetOrder) {
      setFuseBaselineMs(0);
      return;
    }
    const deadline = acceptDeadlineMs(
      sheetOrder.createdAt,
      acceptanceWindowMinutes,
      sheetOrder.merchantResponseDeadlineAt
    );
    const baseline = deadline - Date.now();
    setFuseBaselineMs(Number.isFinite(baseline) ? Math.max(1000, baseline) : 60_000);
  }, [
    sheetOrder?.id,
    sheetOrder?.createdAt,
    sheetOrder?.merchantResponseDeadlineAt,
    acceptanceWindowMinutes,
  ]);

  useEffect(() => {
    if (!sheetOrder) return;
    const t = setInterval(() => {
      if (!isAppForeground()) return;
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [sheetOrder]);

  const secondsLeft = useMemo(() => {
    if (!sheetOrder) return 0;
    return acceptSecondsLeft(
      sheetOrder.createdAt,
      acceptanceWindowMinutes,
      nowTick,
      sheetOrder.merchantResponseDeadlineAt
    );
  }, [sheetOrder, acceptanceWindowMinutes, nowTick]);

  const mmss = useMemo(() => formatAcceptCountdown(secondsLeft), [secondsLeft]);
  /** 1 when modal opens → 0 when accept timer hits zero (visible live fuse) */
  const fuseProgress = useMemo(() => {
    if (!sheetOrder || fuseBaselineMs <= 0) return 1;
    const deadline = acceptDeadlineMs(
      sheetOrder.createdAt,
      acceptanceWindowMinutes,
      sheetOrder.merchantResponseDeadlineAt
    );
    const msLeft = Math.max(0, deadline - nowTick);
    const progress = msLeft / fuseBaselineMs;
    return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  }, [sheetOrder, fuseBaselineMs, acceptanceWindowMinutes, nowTick]);
  const fuseUrgent = secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

  const displayOrder = useMemo(() => {
    if (!sheetOrder) return null;
    const live =
      orders.find((o) => o.id === sheetOrder.id) ??
      orders.find((o) => o.ordersCoreId === sheetOrder.ordersCoreId) ??
      null;
    if (!live) return sheetOrder;
    // Prefer the richer of sheet + board so ordinal/name never flicker downward.
    const ordA = sheetOrder.customerStoreOrderOrdinal;
    const ordB = live.customerStoreOrderOrdinal;
    const totA = sheetOrder.customerStoreOrdersTotal;
    const totB = live.customerStoreOrdersTotal;
    const bestOrd =
      ordA != null && ordB != null
        ? Math.max(ordA, ordB)
        : ordA ?? ordB ?? null;
    const bestTot =
      totA != null && totB != null
        ? Math.max(totA, totB)
        : totA ?? totB ?? null;
    return {
      ...live,
      customerName: (live.customerName ?? "").trim() || sheetOrder.customerName,
      customerStoreOrderOrdinal: bestOrd,
      customerStoreOrdersTotal: bestTot,
      lineItems: live.lineItems?.length ? live.lineItems : sheetOrder.lineItems,
    };
  }, [sheetOrder, orders]);

  /** Lock the highest known store ordinal for this open sheet so polls cannot flash "1st". */
  const stickyCustomerOrdinalRef = useRef<{ orderId: string; ordinal: number } | null>(null);

  const actionStoreId = useMemo(() => {
    const fromOrder = displayOrder?.merchantStoreId ?? sheetOrder?.merchantStoreId;
    if (fromOrder != null && Number.isFinite(fromOrder) && fromOrder > 0) return fromOrder;
    return storeId;
  }, [displayOrder?.merchantStoreId, sheetOrder?.merchantStoreId, storeId]);

  const mapFetchedOrder = useCallback(
    (api: Awaited<ReturnType<typeof fetchFoodOrder>>, sid: number) => {
      const managed = managedStores.find((s) => s.id === sid);
      const storeMeta =
        managed ??
        (selectedStore?.id === sid
          ? selectedStore
          : null);
      return mapApiOrder(api, {
        storeId: sid,
        storeName: storeMeta?.store_name ?? null,
        storeLocality: storeMeta ? shortLocalityFromAddress(storeMeta.full_address) : null,
      });
    },
    [managedStores, selectedStore]
  );

  /** Detail GET has full Partner Site CTM line math — hydrate as soon as the sheet opens. */
  useEffect(() => {
    if (!sheetOrder || !actionStoreId || !token) return;
    if (sheetOrder.id.startsWith("core-")) return;
    const foodId = parseInt(sheetOrder.id, 10);
    if (!Number.isFinite(foodId) || foodId <= 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const updated = await fetchFoodOrder(actionStoreId, foodId, token);
        if (cancelled) return;
        const mapped = mapFetchedOrder(updated, actionStoreId);
        if (mapped.status === "created" && isDismissedCore(sheetOrder.ordersCoreId)) return;
        setCachedFoodOrder(actionStoreId, foodId, updated);
        upsertOrder(mapped);
      } catch {
        /* verifyOpenOrder / board refresh will retry */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sheetOrder?.id, actionStoreId, token, mapFetchedOrder, upsertOrder]);

  /** All still-pending orders (FIFO) the merchant can page through while the sheet is open. */
  const pendingList = useMemo(() => pendingCreatedFifo(orders), [orders]);
  const currentIndex = useMemo(() => {
    if (!sheetOrder) return -1;
    const byId = pendingList.findIndex((o) => o.id === sheetOrder.id);
    if (byId >= 0) return byId;
    return pendingList.findIndex((o) => o.ordersCoreId === sheetOrder.ordersCoreId);
  }, [pendingList, sheetOrder]);
  const pendingTotal = pendingList.length;
  const orderSlideX = useSharedValue(0);
  const orderSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: orderSlideX.value }],
  }));

  /** Move to the previous/next pending order with a horizontal slide.
   *  delta -1 = older (Prev), +1 = newer (Next). Index 0 is always oldest. */
  const applyOrderTarget = useCallback((target: OrderRecord) => {
    shownCoreIdsRef.current.add(`c:${target.ordersCoreId}`);
    seenFoodIdsRef.current.add(target.id);
    setRejectOpen(false);
    setAllItemsOpen(false);
    setBillBreakdownOpen(false);
    setCustomizationItem(null);
    setSheetOrder(target);
  }, []);

  const goToOrder = useCallback(
    (delta: number) => {
      if (pendingTotal <= 1) return;
      const idx =
        currentIndex >= 0
          ? currentIndex
          : pendingList.findIndex(
              (o) =>
                o.id === sheetOrder?.id || o.ordersCoreId === sheetOrder?.ordersCoreId
            );
      const safeIdx = idx >= 0 ? idx : 0;
      const nextIdx = Math.min(pendingTotal - 1, Math.max(0, safeIdx + delta));
      const target = pendingList[nextIdx];
      if (!target || target.id === sheetOrder?.id) return;

      const width = Dimensions.get("window").width;
      const outX = delta > 0 ? -width : width;
      const inX = delta > 0 ? width : -width;

      orderSlideX.value = withTiming(outX * 0.35, { duration: 140 }, (finished) => {
        if (!finished) return;
        runOnJS(applyOrderTarget)(target);
        orderSlideX.value = inX * 0.35;
        orderSlideX.value = withTiming(0, { duration: 180 });
      });
    },
    [
      currentIndex,
      pendingTotal,
      pendingList,
      sheetOrder?.id,
      sheetOrder?.ordersCoreId,
      applyOrderTarget,
      orderSlideX,
    ]
  );

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

  /** Drop the current card; keep other pending orders open (advance). Close only if none left. */
  const advanceOrCloseSheet = useCallback(
    async (opts?: {
      markDismissed?: boolean;
      parkIfLast?: boolean;
      stopReason?: "accepted" | "rejected" | "expired" | "cancelled" | "dismissed";
      /** When set, no-op if the sheet already advanced past this order (accept/sync race). */
      forCoreId?: number | null;
      forFoodId?: string | null;
    }) => {
      const markDismissed = opts?.markDismissed !== false;
      const parkIfLast = opts?.parkIfLast === true;
      const current = sheetOrderRef.current;
      // Sheet already left this order (instant accept/reject close) — never reopen it.
      if (opts?.forCoreId != null && Number.isFinite(Number(opts.forCoreId))) {
        if (!current || Number(current.ordersCoreId) !== Number(opts.forCoreId)) {
          if (markDismissed) await addDismissed(Number(opts.forCoreId));
          return;
        }
      }
      if (opts?.forFoodId != null && current && String(current.id) !== String(opts.forFoodId)) {
        if (markDismissed && opts.forCoreId != null) {
          await addDismissed(Number(opts.forCoreId));
        }
        return;
      }

      const others = pendingList.filter(
        (o) =>
          !current ||
          (o.id !== current.id && o.ordersCoreId !== current.ordersCoreId)
      );

      if (current) {
        void stopNewOrderAlert(current.id, opts?.stopReason ?? "dismissed");
      }

      if (current && markDismissed) {
        markIncomingOrderDismissedLocal(current.ordersCoreId);
      }

      setRejectOpen(false);
      setAllItemsOpen(false);
      setBillBreakdownOpen(false);
      setCustomizationItem(null);

      if (others.length > 0) {
        // Prefer the next FIFO neighbour; else the previous one.
        const idx = currentIndex >= 0 ? currentIndex : 0;
        const after = pendingList
          .slice(idx + 1)
          .filter(
            (o) =>
              !current ||
              (o.id !== current.id && o.ordersCoreId !== current.ordersCoreId)
          );
        const before = pendingList
          .slice(0, Math.max(0, idx))
          .filter(
            (o) =>
              !current ||
              (o.id !== current.id && o.ordersCoreId !== current.ordersCoreId)
          );
        const target = after[0] ?? before[before.length - 1] ?? others[0]!;
        shownCoreIdsRef.current.add(`c:${target.ordersCoreId}`);
        seenFoodIdsRef.current.add(target.id);
        if (current && !markDismissed) {
          shownCoreIdsRef.current.delete(`c:${current.ordersCoreId}`);
          seenFoodIdsRef.current.delete(current.id);
        }
        setParked(false);
        setSheetOrder(target);
      } else if (parkIfLast) {
        setParked(true);
        if (current) {
          shownCoreIdsRef.current.delete(`c:${current.ordersCoreId}`);
          seenFoodIdsRef.current.delete(current.id);
        }
        setSheetOrder(null);
      } else {
        setParked(false);
        setSheetOrder(null);
      }

      if (current && markDismissed) {
        void addDismissed(current.ordersCoreId);
      }
    },
    [pendingList, currentIndex, setParked]
  );

  /**
   * X / backdrop: dismiss the viewed order — never auto-popup again for that order.
   * With multiple pending orders, advance to the next FIFO card (partnersite parity).
   */
  const dismissByUser = useCallback(() => {
    if (rejectingFoodIdRef.current) return;
    const current = sheetOrderRef.current;
    if (current) void stopNewOrderAlert(current.id, "dismissed");
    setRejectOpen(false);
    setAllItemsOpen(false);
    setBillBreakdownOpen(false);
    setCustomizationItem(null);

    if (!current) {
      setSheetOrder(null);
      setParked(false);
      return;
    }

    shownCoreIdsRef.current.add(`c:${current.ordersCoreId}`);
    seenFoodIdsRef.current.add(current.id);

    const fifo = pendingCreatedFifo(orders);
    const others = fifo.filter(
      (o) => o.id !== current.id && o.ordersCoreId !== current.ordersCoreId
    );
    const nextTarget = others.find((o) => !isDismissedCore(o.ordersCoreId));

    if (nextTarget) {
      shownCoreIdsRef.current.add(`c:${nextTarget.ordersCoreId}`);
      seenFoodIdsRef.current.add(nextTarget.id);
      setParked(false);
      setSheetOrder(nextTarget);
      return;
    }

    setParked(false);
    setSheetOrder(null);
  }, [orders, setParked]);

  const dismissSheet = useCallback(async () => {
    await advanceOrCloseSheet({ markDismissed: true, parkIfLast: false });
  }, [advanceOrCloseSheet]);

  const patchStatus = useCallback(
    async (
      status: "ACCEPTED" | "CANCELLED",
      extra?: { rejected_reason?: string; preparation_time_minutes?: number },
      mode: "auto" | "manual" = "manual",
      target?: OrderRecord | null
    ) => {
      const current = target ?? sheetOrder;
      if (!token || !current || current.id.startsWith("core-")) return;
      const foodId = parseInt(current.id, 10);
      const actedCoreId = Number(current.ordersCoreId);
      const actedFoodId = current.id;
      if (!Number.isFinite(foodId)) return;
      const stopReason = status === "ACCEPTED" ? "accepted" : "rejected";
      const alertSessionId = peekNewOrderAlertSessionId(actedFoodId);

      const runTransition = () =>
        transitionOrder(
          current.id,
          status === "ACCEPTED" ? "preparing" : "rejected",
          {
            rejectedReason: extra?.rejected_reason,
            preparationTimeMinutes:
              status === "ACCEPTED" ? extra?.preparation_time_minutes ?? prepMinutes : undefined,
            acceptMode: status === "ACCEPTED" ? mode : undefined,
            cancelMode: status === "CANCELLED" ? mode : undefined,
          }
        );

      // Accept (and auto-cancel) keep the previous immediate-hide path.
      if (status === "ACCEPTED" || mode === "auto") {
        void addDismissed(actedCoreId);
        shownCoreIdsRef.current.add(`c:${actedCoreId}`);
        markIncomingOrderResolved({ orderCoreId: actedCoreId, foodId: actedFoodId });
        void stopNewOrderAlert(current.id, stopReason);
        const patchPromise = runTransition();
        void advanceOrCloseSheet({
          markDismissed: true,
          parkIfLast: false,
          stopReason,
          forCoreId: actedCoreId,
          forFoodId: actedFoodId,
        });
        setActionLoading(true);
        try {
          const applied = await patchPromise;
          if (!applied) return;
          if (status === "CANCELLED" && mode === "auto") {
            showToast("Order cancelled");
          }
        } catch (err) {
          if (isInvalidTransitionError(err)) {
            upsertOrder({
              ...current,
              status: status === "ACCEPTED" ? "preparing" : "rejected",
              pipelineStatus: status,
            });
            if (status === "CANCELLED" && mode === "auto") showToast("Order cancelled");
            requestMerchantDashboardStatsRefresh();
            return;
          }
          if (status === "ACCEPTED") {
            const msg = err instanceof Error && err.message.trim() ? err.message : "Could not accept order";
            showToast(msg);
          }
        } finally {
          setActionLoading(false);
        }
        return;
      }

      rejectFlowLog("CLICK", actedFoodId, alertSessionId);
      setRejectingFoodId(actedFoodId);
      rejectFlowLog("MODAL_LOADING_ON", actedFoodId, alertSessionId);

      try {
        rejectFlowLog("API_START", actedFoodId, alertSessionId);
        const applied = await runTransition();
        rejectFlowLog("API_SUCCESS", actedFoodId, alertSessionId);
        if (!applied) return;

        rejectFlowLog("ORDER_REMOVE_START", actedFoodId, alertSessionId);
        rejectFlowLog("CACHE_RECONCILE_START", actedFoodId, alertSessionId);
        const board = getOrdersSnapshot();
        const stillPending = board.some(
          (o) =>
            o.status === "created" &&
            (o.id === actedFoodId || o.ordersCoreId === actedCoreId)
        );
        rejectFlowLog("CACHE_RECONCILE_DONE", actedFoodId, alertSessionId);
        if (!stillPending) {
          rejectFlowLog("ORDER_REMOVED", actedFoodId, alertSessionId);
        }

        markIncomingOrderResolved({ orderCoreId: actedCoreId, foodId: actedFoodId });
        shownCoreIdsRef.current.add(`c:${actedCoreId}`);
        rejectFlowLog("ALERT_STOP", actedFoodId, alertSessionId);
        await stopNewOrderAlert(current.id, stopReason);
        rejectFlowLog("MODAL_CLOSE", actedFoodId, alertSessionId);
        await advanceOrCloseSheet({
          markDismissed: true,
          parkIfLast: false,
          stopReason,
          forCoreId: actedCoreId,
          forFoodId: actedFoodId,
        });
      } catch (err) {
        if (isInvalidTransitionError(err)) {
          upsertOrder({
            ...current,
            status: "rejected",
            pipelineStatus: status,
          });
          markIncomingOrderResolved({ orderCoreId: actedCoreId, foodId: actedFoodId });
          shownCoreIdsRef.current.add(`c:${actedCoreId}`);
          rejectFlowLog("ALERT_STOP", actedFoodId, alertSessionId);
          await stopNewOrderAlert(current.id, stopReason);
          rejectFlowLog("MODAL_CLOSE", actedFoodId, alertSessionId);
          await advanceOrCloseSheet({
            markDismissed: true,
            parkIfLast: false,
            stopReason,
            forCoreId: actedCoreId,
            forFoodId: actedFoodId,
          });
          requestMerchantDashboardStatsRefresh();
          return;
        }
      } finally {
        if (rejectingFoodIdRef.current === actedFoodId) {
          setRejectingFoodId(null);
        }
      }
    },
    [
      token,
      sheetOrder,
      advanceOrCloseSheet,
      showToast,
      prepMinutes,
      upsertOrder,
      transitionOrder,
      getOrdersSnapshot,
    ]
  );

  const stepPrep = useCallback((delta: number) => {
    setPrepMinutes((prev) =>
      clampPrepMinutes(prev + delta, storeDefaultPrepRef.current)
    );
  }, []);

  useEffect(() => {
    if (!sheetOrder) return;
    const liveById = orders.find((o) => o.id === sheetOrder.id);
    const liveByCore = orders.find((o) => o.ordersCoreId === sheetOrder.ordersCoreId);
    const live = liveById ?? liveByCore;
    // Close ONLY on a definitive action — the order is present with a non-created
    // status (accepted / rejected here or on the Partner Site). A transient ABSENCE
    // must NOT close the modal: an in-flight full refetch that started before an
    // optimistic realtime insert can momentarily drop the row from `orders`, and
    // closing here would both hide and permanently dismiss a still-pending order.
    // `displayOrder` falls back to the opened sheetOrder; the next reconcile restores it.
    if (live && live.status !== "created") {
      if (rejectingFoodIdRef.current === sheetOrder.id) return;
      // Drop only the acted order; advanceOrClose keeps other pending cards open.
      void advanceOrCloseSheet({
        markDismissed: true,
        parkIfLast: false,
        stopReason: live.status === "rejected" ? "rejected" : "expired",
        forCoreId: sheetOrder.ordersCoreId,
        forFoodId: sheetOrder.id,
      });
    }
  }, [orders, sheetOrder, advanceOrCloseSheet]);

  /**
   * Authoritative liveness check while the incoming sheet is open.
   * Backend is the only auto-cancel authority — we never PATCH CANCEL from the fuse.
   * When list/realtime lag (cancelled row filtered off the board), targeted fetch closes
   * the sheet so it never stays open for an inactive order.
   */
  useEffect(() => {
    if (!sheetOrder || !actionStoreId || !token) return;
    if (sheetOrder.id.startsWith("core-")) return;
    const foodId = parseInt(sheetOrder.id, 10);
    const syncCoreId = Number(sheetOrder.ordersCoreId);
    if (!Number.isFinite(foodId)) return;

    let cancelled = false;
    const syncKickInFlight = { current: false };
    const timeoutSyncDone = { current: false };

    const verifyOpenOrder = async () => {
      try {
        const pastDeadline =
          acceptSecondsLeft(
            sheetOrder.createdAt,
            acceptanceWindowMinutes,
            Date.now(),
            sheetOrder.merchantResponseDeadlineAt
          ) <= 0;
        if (pastDeadline && !timeoutSyncDone.current && !syncKickInFlight.current) {
          syncKickInFlight.current = true;
          try {
            await syncAcceptanceTimeout(actionStoreId, token);
            timeoutSyncDone.current = true;
          } catch {
            /* cron owns cancel; sync is a one-shot nudge */
          } finally {
            syncKickInFlight.current = false;
          }
        }

        const updated = await fetchFoodOrder(actionStoreId, foodId, token);
        if (cancelled) return;
        const mapped = mapFetchedOrder(updated, actionStoreId);
        if (mapped.status === "created" && isDismissedCore(syncCoreId)) return;
        setCachedFoodOrder(actionStoreId, foodId, updated);
        upsertOrder(mapped);
        // Only drop THIS order — if the pager already advanced to another card, do nothing.
        const stillViewing =
          sheetOrderRef.current?.id === String(foodId) ||
          Number(sheetOrderRef.current?.ordersCoreId) === syncCoreId;
        if (!stillViewing) return;
        if (rejectingFoodIdRef.current === String(foodId)) return;
        const stage = String(updated.order_status || "").toUpperCase();
        if (stage && stage !== "CREATED" && stage !== "NEW" && stage !== "PLACED") {
          await advanceOrCloseSheet({
            markDismissed: true,
            parkIfLast: false,
            stopReason:
              stage === "CANCELLED" || stage === "REJECTED" ? "cancelled" : "expired",
            forCoreId: syncCoreId,
            forFoodId: String(foodId),
          });
        }
      } catch {
        /* network blip — retry on next tick */
      }
    };

    void verifyOpenOrder();
    const intervalMs = acceptSecondsLeft(
      sheetOrder.createdAt,
      acceptanceWindowMinutes,
      Date.now(),
      sheetOrder.merchantResponseDeadlineAt
    ) <= 0
      ? 8_000
      : 15_000;
    const t = setInterval(() => {
      if (!isAppForeground()) return;
      void verifyOpenOrder();
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [
    sheetOrder?.id,
    sheetOrder?.createdAt,
    sheetOrder?.merchantResponseDeadlineAt,
    sheetOrder?.ordersCoreId,
    actionStoreId,
    token,
    acceptanceWindowMinutes,
    advanceOrCloseSheet,
    mapFetchedOrder,
    upsertOrder,
  ]);

  const order = displayOrder;

  const deliverySlides = useMemo((): IncomingBannerSlide[] => {
    if (!order) {
      return [{ key: "delivery", icon: "bicycle-outline", text: "GatiMitra delivery", tone: "delivery" }];
    }
    const isSelfPickup = order.deliveryType === "SELF_PICKUP";
    const notes = parseMerchantInstructionsList(order.merchantInstructionsList).filter(
      (line) => !/cutlery|utensil/i.test(line)
    );
    const slides: IncomingBannerSlide[] = [
      isSelfPickup
        ? {
            key: "pickup",
            icon: "bag-handle-outline",
            text: "Self-Pick-Up",
            tone: "pickup",
          }
        : {
            key: "delivery",
            icon: "bicycle-outline",
            text: "GatiMitra delivery",
            tone: "delivery",
          },
    ];
    if (order.requiresUtensils != null) {
      slides.push({
        key: "cutlery",
        icon: "restaurant-outline",
        text: order.requiresUtensils ? "Send cutlery & utensils" : "Don't send cutlery",
        tone: "cutlery",
      });
    }
    notes.forEach((line, i) => {
      slides.push({
        key: `note-${i}`,
        icon: "document-text-outline",
        text: line,
        tone: "note",
      });
    });
    return slides;
  }, [order?.id, order?.deliveryType, order?.merchantInstructionsList, order?.requiresUtensils]);

  if (!storeId && !actionStoreId) return null;

  // Prefer frozen total_ctm / pricing.total (Partner Site SSOT) so Accept sheet
  // matches Active cards instead of recomputing from customer-priced lines.
  const incomingBill = order ? merchantIncomingBillPartsFromOrder(order) : null;
  const sheetVisible =
    !!order && !allItemsOpen && !billBreakdownOpen && !customizationItem;
  const lineItems = order?.lineItems ?? [];
  const previewItems = lineItems.slice(0, MAX_PREVIEW_ITEMS);
  const moreCount = Math.max(0, lineItems.length - MAX_PREVIEW_ITEMS);
  const itemCount = lineItems.reduce((s, it) => s + Math.max(1, it.qty || 1), 0);

  const customerLabel = (() => {
    if (!order) return "";
    const candidates = [
      order.customerStoreOrderOrdinal,
      order.customerStoreOrdersTotal,
      stickyCustomerOrdinalRef.current?.orderId === order.id
        ? stickyCustomerOrdinalRef.current.ordinal
        : null,
    ].filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
    const best = candidates.length > 0 ? Math.max(...candidates.map((n) => Math.floor(n))) : 0;
    if (best > 0) {
      const prev = stickyCustomerOrdinalRef.current;
      if (!prev || prev.orderId !== order.id || best > prev.ordinal) {
        stickyCustomerOrdinalRef.current = { orderId: order.id, ordinal: best };
      }
    } else if (stickyCustomerOrdinalRef.current?.orderId !== order.id) {
      stickyCustomerOrdinalRef.current = null;
    }
    const locked =
      stickyCustomerOrdinalRef.current?.orderId === order.id
        ? stickyCustomerOrdinalRef.current.ordinal
        : order.customerStoreOrderOrdinal;
    return formatPartnerIncomingCustomerLabel(
      order.customerName,
      locked,
      order.customerStoreOrdersTotal
    );
  })();

  /** Checkout notes are rotated into the GatiMitra delivery banner slideshow. */
  const orderIsPaid = order ? isPrepaidOrder(order) : false;

  const sheetMaxHeight = Dimensions.get("window").height * 0.98;

  return (
    <AppErrorBoundary source="incoming-order-modal">
    <TypographyVariantProvider variant="brand">
    <>
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => dismissByUser()}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdropTap} onPress={() => dismissByUser()} />

          <View style={styles.sheetStack} pointerEvents="box-none">
            {order ? (
              <>
                <View style={styles.sheetOverlapHeader} pointerEvents="box-none">
                  <View style={styles.headerSideSlot} />
                  <NewOrderFusePill borderProgress={fuseProgress} urgent={fuseUrgent} />
                  <View style={styles.headerSideSlot}>
                    <Pressable
                      onPress={() => setRejectOpen(true)}
                      disabled={actionLoading || rejectingFoodId === order.id}
                      style={({ pressed }) => [
                        styles.rejectPill,
                        (actionLoading || rejectingFoodId === order.id) && styles.btnDisabled,
                        pressed && styles.pressed,
                      ]}
                      hitSlop={8}
                    >
                      {rejectingFoodId === order.id ? (
                        <>
                          <ActivityIndicator color="#EF4444" size="small" />
                          <Text style={styles.rejectPillText} maxFontSizeMultiplier={1.2}>
                            Rejecting...
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.rejectPillText} maxFontSizeMultiplier={1.2}>
                            Reject
                          </Text>
                          <Ionicons name="close" size={14} color="#EF4444" />
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
                  <View style={styles.sheetTopCap} pointerEvents="none" />
                  {pendingTotal > 1 ? (
                    <View style={styles.pagerRowFixed}>
                      <Pressable
                        onPress={() => goToOrder(-1)}
                        disabled={currentIndex <= 0}
                        style={({ pressed }) => [
                          styles.pagerBtn,
                          currentIndex <= 0 && styles.pagerBtnDisabled,
                          pressed && styles.pressed,
                        ]}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Previous order"
                      >
                        <Ionicons name="chevron-back" size={18} color={GatiMitraMerchant.textPrimary} />
                        <Text style={styles.pagerBtnText}>Prev</Text>
                      </Pressable>
                      <View style={styles.pagerCenter}>
                        <Text style={styles.pagerLabel}>
                          Order {Math.max(1, currentIndex + 1)} of {pendingTotal}
                        </Text>
                        <View style={styles.pagerDots}>
                          {pendingList.map((o, i) => (
                            <View
                              key={o.id}
                              style={[styles.pagerDot, i === currentIndex && styles.pagerDotActive]}
                            />
                          ))}
                        </View>
                      </View>
                      <Pressable
                        onPress={() => goToOrder(1)}
                        disabled={currentIndex >= pendingTotal - 1}
                        style={({ pressed }) => [
                          styles.pagerBtn,
                          currentIndex >= pendingTotal - 1 && styles.pagerBtnDisabled,
                          pressed && styles.pressed,
                        ]}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Next order"
                      >
                        <Text style={styles.pagerBtnText}>Next</Text>
                        <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textPrimary} />
                      </Pressable>
                    </View>
                  ) : null}
                  <Animated.View style={[orderSlideStyle, { overflow: "hidden" }]}>
                    <ScrollView
                      style={styles.body}
                      contentContainerStyle={styles.bodyContent}
                      showsVerticalScrollIndicator={false}
                      bounces={false}
                    >
                  <IncomingDeliveryBanner slides={deliverySlides} resetKey={order.id} />

                  <View style={styles.orderMetaRow}>
                    <View style={styles.orderIdWithCount}>
                      <FormattedOrderId
                        formattedOrderId={order.formattedOrderId}
                        fallbackCoreId={order.ordersCoreId}
                        fallbackFoodId={parseInt(order.id, 10) || undefined}
                        size="lg"
                      />
                    </View>
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

                  {order.deliveryType !== "SELF_PICKUP" && order.dropAddress ? (
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
                      <>
                        <View style={styles.itemColumnsHeader}>
                          <Text style={styles.itemNameHeader}>Item name</Text>
                          <Text style={styles.qtyHeader}>Qty</Text>
                          <Text style={styles.amountHeader}>Price</Text>
                        </View>
                        {previewItems.map((item, idx) => (
                          <View
                            key={`${item.name}-${idx}`}
                            style={[styles.itemRowWrap, idx < previewItems.length - 1 && styles.itemRowBorder]}
                          >
                            <OrderCardItemRow
                              item={item}
                              index={idx + 1}
                              orderVeg={order.vegNonVeg}
                              showPrice
                              showQuantityColumn
                              showExpandChevron
                              dense
                              onItemNamePress={() => openCustomizationSheet(item, setCustomizationItem)}
                              onRowPress={() => openCustomizationSheet(item, setCustomizationItem)}
                            />
                          </View>
                        ))}
                      </>
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

                  {incomingBill ? (
                    <MerchantIncomingBillCard
                      bill={incomingBill}
                      itemCount={itemCount}
                      paid={orderIsPaid}
                      mode="summary"
                      onPress={() => setBillBreakdownOpen(true)}
                    />
                  ) : null}
                    </ScrollView>
                  </Animated.View>

                  <View
                    style={[
                      styles.footerBlock,
                      {
                        paddingBottom: Math.max(
                          insets.bottom + 8,
                          Platform.OS === "ios" ? 18 : 16
                        ),
                      },
                    ]}
                  >
                    <View style={styles.prepFooterRow}>
                      <View style={styles.prepLabelHalf}>
                        <Text style={styles.prepTitle} numberOfLines={1}>
                          Preparation time
                        </Text>
                        <Text style={styles.prepHint} numberOfLines={1}>
                          {PREP_TIME_MIN}–{PREP_TIME_MAX} min
                        </Text>
                      </View>
                      <View style={styles.prepStepperHalf}>
                        <View style={styles.prepStepper}>
                          <Pressable
                            style={[styles.prepBtn, prepMinutes <= PREP_TIME_MIN && styles.prepBtnDisabled]}
                            disabled={prepMinutes <= PREP_TIME_MIN || actionLoading || !!rejectingFoodId}
                            onPress={() => stepPrep(-PREP_STEP_MINUTES)}
                          >
                            <Text style={styles.prepBtnText}>−</Text>
                          </Pressable>
                          <Text style={styles.prepValue}>{prepMinutes}m</Text>
                          <Pressable
                            style={[styles.prepBtn, prepMinutes >= PREP_TIME_MAX && styles.prepBtnDisabled]}
                            disabled={prepMinutes >= PREP_TIME_MAX || actionLoading || !!rejectingFoodId}
                            onPress={() => stepPrep(PREP_STEP_MINUTES)}
                          >
                            <Text style={styles.prepBtnText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    <View style={styles.footer}>
                      <AcceptOrderSwipeButton
                        loading={actionLoading}
                        disabled={secondsLeft <= 0 || !!rejectingFoodId}
                        countdown={mmss}
                        timeProgress={fuseProgress}
                        remainingMs={Math.max(0, fuseBaselineMs * fuseProgress)}
                        urgent={fuseUrgent}
                        orderKey={order.id}
                        onPress={() =>
                          void patchStatus("ACCEPTED", { preparation_time_minutes: prepMinutes }, "manual")
                        }
                      />
                    </View>
                  </View>
                </View>
              </>
            ) : null}
          </View>

          {order ? (
            <Pressable
              onPress={() => dismissByUser()}
              style={[styles.minimizeBtn, { top: insets.top + HEADER_HEIGHT + 10 }]}
              accessibilityRole="button"
              accessibilityLabel="Close incoming order sheet"
              hitSlop={12}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
      </Modal>

      {order ? (
        <>
          <IncomingOrderBillBreakdownSheet
            visible={billBreakdownOpen}
            bill={incomingBill ?? { itemsSubtotal: 0, packaging: 0, discount: 0, taxes: 0, total: order.total }}
            itemCount={itemCount}
            paid={orderIsPaid}
            onClose={() => setBillBreakdownOpen(false)}
          />

          <IncomingOrderAllItemsSheet
            visible={allItemsOpen}
            items={lineItems}
            bill={incomingBill ?? { itemsSubtotal: 0, packaging: 0, discount: 0, taxes: 0, total: order.total }}
            paid={orderIsPaid}
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
            loading={!!rejectingFoodId}
            onClose={() => !rejectingFoodId && setRejectOpen(false)}
            onConfirm={(reason: MerchantCancellationReason) => {
              if (!order) return;
              const snap = order;
              setRejectOpen(false);
              void (async () => {
                await patchStatus("CANCELLED", { rejected_reason: reason }, "manual", snap);
                if (
                  rejectReasonNeedsFollowUp(reason) &&
                  rejectingFoodIdRef.current == null &&
                  sheetOrderRef.current?.id !== snap.id
                ) {
                  beginFollowUp(reason, snap.lineItems, async () => {});
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
    </TypographyVariantProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  minimizeBtn: {
    position: "absolute",
    right: H_PADDING,
    zIndex: 80,
    elevation: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  sheetStack: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
    paddingBottom: 0,
    overflow: "visible",
    zIndex: 2,
  },
  /** Porter-style: pill + reject float above sheet top edge */
  sheetOverlapHeader: {
    position: "relative",
    minHeight: BADGE_H,
    marginBottom: -BADGE_OVERLAP,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 0,
    ...Platform.select({
      android: { elevation: 16 },
      default: {},
    }),
  },
  headerSideSlot: {
    flex: 1,
    minWidth: 72,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  badgeFuseShell: {
    width: BADGE_W,
    height: BADGE_H,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: -10,
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
    backgroundColor: "#F7F8FA",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
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
  /** Solid fill under pill overlap — removes grey shadow band at sheet top */
  sheetTopCap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: BADGE_OVERLAP + 6,
    backgroundColor: "#F7F8FA",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    zIndex: 1,
  },
  body: { flexShrink: 1, maxHeight: 720 },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
  },
  pagerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 0,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  /** Fixed above sliding order body — does not animate with Prev/Next. */
  pagerRowFixed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginHorizontal: H_PADDING,
    marginTop: 4,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pagerBtnDisabled: { opacity: 0.35 },
  pagerBtnText: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  pagerCenter: { flex: 1, alignItems: "center" },
  pagerLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pagerDots: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GatiMitraMerchant.border },
  pagerDotActive: { width: 16, backgroundColor: GatiMitraMerchant.primaryDark },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  orderIdWithCount: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
  },
  itemCountBeside: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  orderTime: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: MerchantFonts.poppinsSemiBold,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  customerName: {
    marginTop: 4,
    marginBottom: 2,
    fontSize: 17,
    fontWeight: "700",
    fontFamily: MerchantFonts.loraBold,
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 24,
    letterSpacing: -0.25,
  },
  bulkBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
    padding: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  bulkTextWrap: { flex: 1 },
  bulkTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#92400E",
  },
  bulkSub: { fontSize: 12, color: "#B45309", marginTop: 2, lineHeight: 16 },
  addressCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8ECF2",
    elevation: 0,
    shadowOpacity: 0,
  },
  addressText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    fontFamily: MerchantFonts.poppinsSemiBold,
    color: "#475569",
    lineHeight: 19,
  },
  itemsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 2,
  },
  itemsHeading: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#64748B",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  viewAllLink: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: MerchantFonts.poppinsBold,
    color: "#0F766E",
  },
  itemsCard: {
    borderWidth: 1,
    borderColor: "#E8ECF2",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    elevation: 0,
    shadowOpacity: 0,
  },
  itemRowWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
  },
  itemColumnsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F7",
    backgroundColor: "#F1F5F9",
  },
  itemNameHeader: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  qtyHeader: {
    width: 48,
    minWidth: 48,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  amountHeader: {
    width: 72,
    minWidth: 72,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
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
  footerBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF2",
    backgroundColor: "#FFFFFF",
    paddingTop: 14,
    paddingBottom: 4,
    gap: 12,
  },
  prepFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: H_PADDING,
  },
  prepLabelHalf: {
    flex: 1,
    minWidth: 0,
  },
  prepStepperHalf: {
    flex: 1,
    minWidth: 0,
    alignItems: "stretch",
  },
  prepTitle: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: MerchantFonts.poppinsBold,
    color: GatiMitraMerchant.textPrimary,
  },
  prepHint: {
    fontSize: 11,
    fontFamily: MerchantFonts.poppinsSemiBold,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 3,
  },
  prepStepper: {
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    width: "100%",
  },
  prepBtn: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  prepBtnDisabled: { opacity: 0.4 },
  prepBtnText: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: MerchantFonts.poppinsBold,
    color: GatiMitraMerchant.textPrimary,
  },
  prepValue: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    fontFamily: MerchantFonts.poppinsBold,
    color: GatiMitraMerchant.textPrimary,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 10,
    fontVariant: ["tabular-nums"],
  },
  footer: {
    paddingHorizontal: H_PADDING + 10,
    paddingTop: 2,
    paddingBottom: 2,
    backgroundColor: "#FFFFFF",
    width: "100%",
    marginBottom: 0,
    alignItems: "center",
  },
  acceptBtnWrap: {
    width: "92%",
    alignSelf: "center",
  },
  acceptBtn: {
    width: "100%",
    height: SLIDE_TRACK_H,
    borderRadius: SLIDE_TRACK_H / 2,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
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
    borderTopLeftRadius: SLIDE_TRACK_H / 2,
    borderBottomLeftRadius: SLIDE_TRACK_H / 2,
  },
  acceptHandle: {
    position: "absolute",
    left: SLIDE_PAD,
    top: (SLIDE_TRACK_H - SLIDE_THUMB_H) / 2,
    width: SLIDE_THUMB_W,
    height: SLIDE_THUMB_H,
    borderRadius: SLIDE_THUMB_H / 2,
    backgroundColor: SLIDE_ACTION_THUMB_BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  acceptText: {
    width: "100%",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.15,
    paddingLeft: SLIDE_THUMB_W + 14,
    paddingRight: 14,
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
