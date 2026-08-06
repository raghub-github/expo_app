/**
 * BHIM-matched payment success:
 * 1) Green splash slides up from bottom → seal pop + title.
 * 2) Green panel smoothly settles to curved hero; white receipt rises from bottom (no hard cut / jump).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Platform,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { OrderDeliveryDetailsCard } from "@/components/orders/OrderDeliveryDetailsCard";
import { GatiMitraColors } from "@/constants/gatimitra";
import { buildOrderDeliveryDetailsView } from "@/lib/order-delivery-details";
import { parseOrderBillFromSnapshot } from "@/lib/orderBillBreakdown";
import { playCustomerNotificationSound } from "@/lib/playCustomerNotificationSound";
import { orderService } from "@/services/order.service";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const BRAND_GREEN = GatiMitraColors.emerald;
const SOFT_BG = "#F4F6F7";
/** Auto-open tracking if neither CTA is tapped. */
const AUTO_TRACK_SEC = 4;
/** Hold full-green splash before settle (BHIM reference ~0.9–1.2s after seal). */
const SPLASH_HOLD_MS = 1100;
/** Green hero body height after settle (excl. status bar + curve). */
const HERO_BODY_HEIGHT = 236;
/**
 * BHIM hero bottom wave height — side scoops + center tongue.
 * Must be tall enough for the concave shoulders + convex tab.
 */
const HERO_CURVE_DEPTH = 58;
const SEAL_LOBES = 24;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

/**
 * Exact BHIM success-screen bottom edge:
 * left/right concave scoops (white bites up) + wide rounded center tongue down.
 */
function buildBhimHeroCurvePaths(width: number, depth: number) {
  const w = width;
  const d = depth;
  const mid = w / 2;
  /** Side attach height — green drops a bit at the screen edges. */
  const edge = d * 0.32;
  /** Side scoop peak — almost flush with the hero body. */
  const shoulder = Math.max(2, d * 0.02);
  /** Center tongue tip. */
  const tip = d;
  /**
   * Wide center lobe (~46% width) with a soft rounded bottom — BHIM “tab”.
   * Path: edge → scoop up → down into tongue → tip → mirror.
   */
  const edgePath = [
    `M0,${edge.toFixed(2)}`,
    `C${(w * 0.08).toFixed(2)},${edge.toFixed(2)} ${(w * 0.12).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.18).toFixed(2)},${shoulder.toFixed(2)}`,
    `C${(w * 0.26).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.29).toFixed(2)},${(d * 0.42).toFixed(2)} ${(w * 0.34).toFixed(2)},${(d * 0.7).toFixed(2)}`,
    `C${(w * 0.39).toFixed(2)},${(d * 0.92).toFixed(2)} ${(w * 0.43).toFixed(2)},${tip.toFixed(2)} ${mid.toFixed(2)},${tip.toFixed(2)}`,
    `C${(w * 0.57).toFixed(2)},${tip.toFixed(2)} ${(w * 0.61).toFixed(2)},${(d * 0.92).toFixed(2)} ${(w * 0.66).toFixed(2)},${(d * 0.7).toFixed(2)}`,
    `C${(w * 0.71).toFixed(2)},${(d * 0.42).toFixed(2)} ${(w * 0.74).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.82).toFixed(2)},${shoulder.toFixed(2)}`,
    `C${(w * 0.88).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.92).toFixed(2)},${edge.toFixed(2)} ${w.toFixed(2)},${edge.toFixed(2)}`,
  ].join("");

  const fillPath = [
    `M0,0`,
    `L${w.toFixed(2)},0`,
    `L${w.toFixed(2)},${edge.toFixed(2)}`,
    `C${(w * 0.92).toFixed(2)},${edge.toFixed(2)} ${(w * 0.88).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.82).toFixed(2)},${shoulder.toFixed(2)}`,
    `C${(w * 0.74).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.71).toFixed(2)},${(d * 0.42).toFixed(2)} ${(w * 0.66).toFixed(2)},${(d * 0.7).toFixed(2)}`,
    `C${(w * 0.61).toFixed(2)},${(d * 0.92).toFixed(2)} ${(w * 0.57).toFixed(2)},${tip.toFixed(2)} ${mid.toFixed(2)},${tip.toFixed(2)}`,
    `C${(w * 0.43).toFixed(2)},${tip.toFixed(2)} ${(w * 0.39).toFixed(2)},${(d * 0.92).toFixed(2)} ${(w * 0.34).toFixed(2)},${(d * 0.7).toFixed(2)}`,
    `C${(w * 0.29).toFixed(2)},${(d * 0.42).toFixed(2)} ${(w * 0.26).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.18).toFixed(2)},${shoulder.toFixed(2)}`,
    `C${(w * 0.12).toFixed(2)},${shoulder.toFixed(2)} ${(w * 0.08).toFixed(2)},${edge.toFixed(2)} 0,${edge.toFixed(2)}`,
    `Z`,
  ].join("");

  return { fillPath, edgePath };
}

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAmount(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Paid";
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const mon = date.toLocaleString("en-IN", { month: "short" });
  const yy = String(date.getFullYear()).slice(-2);
  const time = date.toLocaleString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day}${suffix} ${mon} ${yy}, ${time}`;
}

function checkPathLength(size: number): number {
  const x1 = size * 0.28;
  const y1 = size * 0.52;
  const x2 = size * 0.44;
  const y2 = size * 0.68;
  const x3 = size * 0.74;
  const y3 = size * 0.34;
  return Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
}

function buildScallopedSealPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  lobes: number
): string {
  const parts: string[] = [];
  for (let i = 0; i < lobes; i++) {
    const a0 = (i / lobes) * Math.PI * 2 - Math.PI / 2;
    const aMid = ((i + 0.5) / lobes) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / lobes) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + Math.cos(a0) * rInner;
    const y0 = cy + Math.sin(a0) * rInner;
    const xt = cx + Math.cos(aMid) * rOuter;
    const yt = cy + Math.sin(aMid) * rOuter;
    const x1 = cx + Math.cos(a1) * rInner;
    const y1 = cy + Math.sin(a1) * rInner;
    if (i === 0) parts.push(`M${x0.toFixed(3)},${y0.toFixed(3)}`);
    parts.push(`Q${xt.toFixed(3)},${yt.toFixed(3)} ${x1.toFixed(3)},${y1.toFixed(3)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function buildCheckPath(size: number): string {
  const s = size;
  return `M${s * 0.28},${s * 0.52} L${s * 0.44},${s * 0.68} L${s * 0.74},${s * 0.34}`;
}

function BhimSuccessSeal({
  size = 72,
  animate = false,
}: {
  size?: number;
  animate?: boolean;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 0.5;
  const rInner = rOuter * 0.88;
  const sealPath = useMemo(
    () => buildScallopedSealPath(cx, cy, rOuter, rInner, SEAL_LOBES),
    [cx, cy, rOuter, rInner]
  );
  const haloPath = useMemo(
    () => buildScallopedSealPath(cx, cy, rOuter * 1.18, rOuter * 1.02, SEAL_LOBES),
    [cx, cy, rOuter]
  );
  const checkPath = useMemo(() => buildCheckPath(size), [size]);
  const stroke = Math.max(3.5, size * 0.07);
  const pathLen = useMemo(() => checkPathLength(size), [size]);

  const scale = useSharedValue(animate ? 0.12 : 1);
  const sealOpacity = useSharedValue(animate ? 0 : 1);
  const checkProgress = useSharedValue(animate ? 0 : 1);
  const halo = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) {
      scale.value = 1;
      sealOpacity.value = 1;
      checkProgress.value = 1;
      halo.value = 1;
      return;
    }
    scale.value = withDelay(
      180,
      withSequence(
        withSpring(1.1, { damping: 10, stiffness: 170 }),
        withSpring(1, { damping: 14, stiffness: 200 })
      )
    );
    sealOpacity.value = withDelay(180, withTiming(1, { duration: 160 }));
    checkProgress.value = withDelay(
      380,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })
    );
    halo.value = withDelay(
      260,
      withSequence(withTiming(1, { duration: 400 }), withTiming(0.28, { duration: 650 }))
    );
  }, [animate, checkProgress, halo, scale, sealOpacity]);

  const sealStyle = useAnimatedStyle(() => ({
    opacity: sealOpacity.value,
    transform: [{ scale: scale.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(halo.value, [0, 1], [0, 0.32]),
    transform: [{ scale: interpolate(halo.value, [0, 1], [0.72, 1.06]) }],
  }));

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLen * (1 - checkProgress.value),
  }));

  return (
    <View style={[styles.sealWrap, { width: size * 1.35, height: size * 1.35 }]}>
      {animate ? (
        <AnimatedSvg
          width={size * 1.35}
          height={size * 1.35}
          viewBox={`0 0 ${size} ${size}`}
          style={[StyleSheet.absoluteFillObject, haloStyle]}
        >
          <Path d={haloPath} fill="rgba(255,255,255,0.28)" />
        </AnimatedSvg>
      ) : null}
      <Animated.View style={[{ width: size, height: size }, sealStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Path d={sealPath} fill="#FFFFFF" />
          <AnimatedPath
            d={checkPath}
            stroke={BRAND_GREEN}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${pathLen} ${pathLen}`}
            animatedProps={checkProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

function DetailBlock({
  label,
  value,
  copyable = false,
  onCopy,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  onCopy?: () => void;
}) {
  return (
    <View style={styles.detailColumn}>
      <AppText style={styles.detailLabel}>{label}</AppText>
      <View style={styles.detailValueRow}>
        <AppText style={styles.detailValue} numberOfLines={2}>
          {value}
        </AppText>
        {copyable ? (
          <TouchableOpacity onPress={onCopy} hitSlop={10} accessibilityLabel="Copy">
            <Ionicons name="copy-outline" size={15} color="#5F6368" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** Narrow light-yellow ticker above Track / Home CTAs. */
function AutoTrackMarqueeBanner({ message }: { message: string }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const textW = useRef(0);
  const viewW = useRef(0);
  const loopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    translateX.setValue(0);
    const overflow = textW.current - viewW.current;
    if (overflow <= 8) return;
    const scrollMs = Math.max(5000, overflow * 28);
    loopRef.current = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(400),
        RNAnimated.timing(translateX, {
          toValue: -overflow - 24,
          duration: scrollMs,
          useNativeDriver: true,
        }),
        RNAnimated.delay(600),
        RNAnimated.timing(translateX, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [message, translateX]);

  return (
    <View style={styles.autoTrackBanner} accessibilityLiveRegion="polite">
      <Ionicons name="time-outline" size={13} color="#A16207" style={styles.autoTrackIcon} />
      <View
        style={styles.autoTrackMarquee}
        onLayout={(e) => {
          viewW.current = e.nativeEvent.layout.width;
        }}
      >
        <RNAnimated.View style={{ flexDirection: "row", transform: [{ translateX }] }}>
          <AppText
            style={styles.autoTrackText}
            numberOfLines={1}
            onLayout={(e) => {
              textW.current = e.nativeEvent.layout.width;
            }}
          >
            {message}
          </AppText>
        </RNAnimated.View>
      </View>
    </View>
  );
}

export default function OrderSuccessScreen() {
  const params = useLocalSearchParams<{
    orderId?: string | string[];
    formattedOrderId?: string | string[];
    merchantName?: string | string[];
    etaMinutes?: string | string[];
    deliveryEtaLabel?: string | string[];
  }>();
  const route = useRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [receiptInteractive, setReceiptInteractive] = useState(false);
  const [autoTrackSec, setAutoTrackSec] = useState(AUTO_TRACK_SEC);
  const ctaTakenRef = useRef(false);

  const routeParams = route.params as
    | {
        orderId?: string;
        merchantName?: string;
        etaMinutes?: number;
        deliveryEtaLabel?: string;
      }
    | undefined;
  const id = paramValue(params.orderId) || routeParams?.orderId || "";
  const fallbackMerchant = paramValue(params.merchantName) || routeParams?.merchantName || "";
  const formattedOrderId = paramValue(params.formattedOrderId);
  const etaLabel =
    paramValue(params.deliveryEtaLabel) ||
    routeParams?.deliveryEtaLabel ||
    (Number(paramValue(params.etaMinutes) || routeParams?.etaMinutes) > 0
      ? `${Number(paramValue(params.etaMinutes) || routeParams?.etaMinutes)} mins`
      : "");

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderService.getOrder(id),
    enabled: Boolean(id),
  });

  /** 0 = off-screen below, 1 = full splash, 2 = settled receipt. */
  const phase = useSharedValue(0);
  const settledHeroHeight = insets.top + HERO_BODY_HEIGHT + HERO_CURVE_DEPTH;

  useFocusEffect(
    useCallback(() => {
      useScreenChromeStore.setState({
        statusBarBackground: BRAND_GREEN,
        statusBarStyle: "light",
        hideStatusBarSpacer: true,
      });
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        NativeStatusBar.setBackgroundColor(BRAND_GREEN, true);
        NativeStatusBar.setBarStyle("light-content", true);
      }
      return () => useScreenChromeStore.getState().resetStatusBarBackground();
    }, [])
  );

  useEffect(() => {
    // Enter from BOTTOM → full green splash.
    phase.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    });
    // Chime once success UI is on screen (after splash starts).
    const soundTimer = setTimeout(() => {
      void playCustomerNotificationSound();
    }, 280);
    const hold = setTimeout(() => {
      // Settle: green shrinks up, white rises — soft spring so the curve stops (no jump).
      phase.value = withSpring(
        2,
        { damping: 18, stiffness: 68, mass: 1.05, overshootClamping: false },
        (finished) => {
          if (finished) runOnJS(setReceiptInteractive)(true);
        }
      );
    }, SPLASH_HOLD_MS + 520);
    return () => {
      clearTimeout(hold);
      clearTimeout(soundTimer);
    };
  }, [phase]);

  const displayOrderId = order?.formattedOrderId ?? formattedOrderId ?? order?.orderId ?? id;
  const merchantName =
    order?.merchantPublicName ?? order?.merchantName ?? fallbackMerchant ?? "Your restaurant";
  const paidAt = formatDateTime(order?.createdAt);
  const deliveryDetails = useMemo(() => {
    if (!order) return null;
    const contactName = order.deliveryContactName?.trim() || null;
    const contactPhone = order.deliveryContactPhone?.trim() || null;
    const contactTitle =
      contactName && contactPhone
        ? `${contactName}, ${contactPhone}`
        : contactName ?? contactPhone;
    const base = buildOrderDeliveryDetailsView(order);
    return {
      contactTitle,
      contactSubtitle: contactTitle ? "Delivery partner may call this number" : null,
      addressTitle: base.addressTitle,
      addressLine: base.addressLine,
      /** Success receipt — no delivery-instructions row. */
      instructionItems: [] as string[],
    };
  }, [order]);

  const { amount, showFullyGatiCashHint } = useMemo(() => {
    const total = order?.totalAmount;
    const fromApi = Number(order?.gatiCashUsed);
    const fromSnap = parseOrderBillFromSnapshot(
      order?.billingSnapshot ?? null,
      total ?? 0
    ).gatiCashApplied;
    const gatiCash =
      Number.isFinite(fromApi) && fromApi > 0.005
        ? fromApi
        : fromSnap > 0.005
          ? fromSnap
          : 0;
    const fully =
      order?.fullyGatiCashUsed === true ||
      (gatiCash > 0.005 && (total == null || total <= 0.005));
    const displayValue =
      fully && gatiCash > 0.005
        ? gatiCash
        : total != null && Number.isFinite(total)
          ? total
          : gatiCash > 0.005
            ? gatiCash
            : undefined;
    return {
      amount: formatAmount(displayValue),
      showFullyGatiCashHint: fully && gatiCash > 0.005,
    };
  }, [order?.totalAmount, order?.gatiCashUsed, order?.fullyGatiCashUsed, order?.billingSnapshot]);

  const statusText = useMemo(() => {
    if (showFullyGatiCashHint) return "100% GatiCash used";
    if (etaLabel) return `Delivery in ${etaLabel}`;
    return "Order placed successfully";
  }, [etaLabel, showFullyGatiCashHint]);

  const copyOrderId = useCallback(async () => {
    const text = String(displayOrderId ?? "").trim();
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text.startsWith("#") ? text.slice(1) : text);
      Alert.alert("Copied", "Order ID copied");
    } catch {
      Alert.alert("Copy failed", "Could not copy Order ID");
    }
  }, [displayOrderId]);

  const cancelAutoTrack = useCallback(() => {
    ctaTakenRef.current = true;
  }, []);

  const trackOrder = useCallback(() => {
    cancelAutoTrack();
    if (!id) {
      router.replace("/(tabs)/orders");
      return;
    }
    router.replace(`/orders/${id}` as const);
  }, [cancelAutoTrack, id, router]);

  const goHome = useCallback(() => {
    cancelAutoTrack();
    router.replace("/(tabs)/");
  }, [cancelAutoTrack, router]);

  /** After receipt settles — countdown then auto-open tracking unless a CTA was used. */
  useEffect(() => {
    if (!receiptInteractive || !id) return;
    ctaTakenRef.current = false;
    setAutoTrackSec(AUTO_TRACK_SEC);
    const tick = setInterval(() => {
      setAutoTrackSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    const redirect = setTimeout(() => {
      if (ctaTakenRef.current) return;
      router.replace(`/orders/${id}` as const);
    }, AUTO_TRACK_SEC * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(redirect);
    };
  }, [receiptInteractive, id, router]);

  const autoTrackMessage = `Auto redirecting to tracking if nothing clicked from CTA in next ${autoTrackSec} sec`;

  /** Green panel: slides up from bottom, then height settles — curve is BHIM U-dip. */
  const greenPanelStyle = useAnimatedStyle(() => {
    const p = phase.value;
    const enterT = interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP);
    const settleT = interpolate(p, [1, 2], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(enterT, [0, 1], [windowHeight, 0]);
    const height = interpolate(settleT, [0, 1], [windowHeight, settledHeroHeight]);
    return {
      height,
      transform: [{ translateY }],
    };
  });

  /** Curve slot grows under the green body so the U-dip becomes the real bottom edge. */
  const heroCurveSlotStyle = useAnimatedStyle(() => {
    const settleT = interpolate(phase.value, [1, 2], [0, 1], Extrapolation.CLAMP);
    return {
      height: interpolate(settleT, [0, 1], [0, HERO_CURVE_DEPTH]),
      opacity: interpolate(settleT, [0.15, 0.55], [0, 1], Extrapolation.CLAMP),
    };
  });

  /** Splash-only title — fades out as receipt details appear. */
  const splashTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [1, 1.35], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(phase.value, [1, 1.45], [0, -12], Extrapolation.CLAMP),
      },
    ],
  }));

  /** Receipt hero copy (Paid / amount / status) — fades in during settle. */
  const receiptHeroCopyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [1.15, 1.75], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(phase.value, [1.15, 1.85], [18, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  /** White body rises from bottom under the settling green curve. */
  const bodyStyle = useAnimatedStyle(() => {
    const settleT = interpolate(phase.value, [1, 2], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(settleT, [0, 0.25, 1], [0, 0.85, 1]),
      transform: [
        {
          translateY: interpolate(settleT, [0, 1], [Math.round(windowHeight * 0.42), 0]),
        },
      ],
    };
  });

  const bottomBarStyle = useAnimatedStyle(() => {
    const settleT = interpolate(phase.value, [1.25, 2], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: settleT,
      transform: [{ translateY: interpolate(settleT, [0, 1], [36, 0]) }],
    };
  });

  /** Splash seam line under title — only while full green. */
  const splashSeamStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0.85, 1, 1.25], [0, 1, 0], Extrapolation.CLAMP),
  }));

  if (!id) {
    return (
      <View style={[styles.invalidScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <AppText style={styles.invalidTitle}>Order details unavailable</AppText>
        <TouchableOpacity style={styles.fullHomeButton} onPress={goHome}>
          <AppText style={styles.fullHomeButtonText}>Back to Home</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const seamW = windowWidth;
  const dipH = HERO_CURVE_DEPTH;
  const { fillPath: heroCurveFillPath, edgePath: heroCurveEdgePath } = buildBhimHeroCurvePaths(
    seamW,
    dipH
  );
  /** Splash mid-screen seam — same BHIM wave. */
  const seamPath = heroCurveEdgePath;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={BRAND_GREEN} translucent />

      {/* White / soft page under green — revealed from bottom as green settles */}
      <Animated.View style={[styles.bodyLayer, bodyStyle]} pointerEvents={receiptInteractive ? "auto" : "none"}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              // Cards sit clearly below the curve for balance.
              paddingTop: settledHeroHeight + 28,
              paddingBottom: Math.max(insets.bottom, 16) + 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.infoCard}>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={BRAND_GREEN} />
                <AppText style={styles.loadingText}>Loading order details…</AppText>
              </View>
            ) : (
              <>
                <DetailBlock label="Restaurant" value={merchantName} />

                <View style={styles.detailGrid}>
                  <DetailBlock
                    label="Order ID"
                    value={`#${displayOrderId}`}
                    copyable
                    onCopy={copyOrderId}
                  />
                  <DetailBlock label="Date & Time" value={paidAt} />
                </View>
              </>
            )}
          </View>

          {deliveryDetails ? (
            <View style={styles.deliveryCardWrap}>
              <OrderDeliveryDetailsCard {...deliveryDetails} showPeachBanner={false} />
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* Green success panel — enters from bottom; bottom edge = BHIM U-curve */}
      <Animated.View style={[styles.greenPanel, greenPanelStyle]} pointerEvents="none">
        <View style={[styles.greenBody, { paddingTop: insets.top + 8 }]}>
          <Animated.View style={[styles.brandEyebrowWrap, receiptHeroCopyStyle]}>
            <AppText style={styles.brandEyebrow}>GatiMitra · Made for Your Moments</AppText>
          </Animated.View>

          <BhimSuccessSeal size={68} animate />

          {/* Absolute — must not push Paid / amount / status into the curve. */}
          <Animated.View style={[styles.splashTitleWrap, splashTitleStyle]} pointerEvents="none">
            <AppText style={styles.splashTitle}>Payment Successful</AppText>
          </Animated.View>

          <Animated.View style={[styles.receiptHeroCopy, receiptHeroCopyStyle]}>
            <AppText style={styles.paidLabel}>Paid</AppText>
            <AppText style={styles.amount}>{amount}</AppText>
            <AppText style={styles.statusUnderAmount} numberOfLines={1}>
              {statusText}
            </AppText>
          </Animated.View>
        </View>

        <Animated.View style={[styles.splashSeam, splashSeamStyle]} pointerEvents="none">
          <Svg width={seamW} height={dipH + 2} viewBox={`0 0 ${seamW} ${dipH + 2}`}>
            <Path d={seamPath} stroke="rgba(255,255,255,0.28)" strokeWidth={1.25} fill="none" />
          </Svg>
        </Animated.View>

        {/* BHIM wave: side scoops + center tongue */}
        <Animated.View style={[styles.heroCurveWrap, heroCurveSlotStyle]} pointerEvents="none">
          <Svg width={seamW} height={dipH} viewBox={`0 0 ${seamW} ${dipH}`}>
            <Path d={heroCurveFillPath} fill={BRAND_GREEN} />
            <Path
              d={heroCurveEdgePath}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={1.15}
              fill="none"
            />
          </Svg>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 14) },
          bottomBarStyle,
        ]}
        pointerEvents={receiptInteractive ? "auto" : "none"}
      >
        {receiptInteractive && id ? (
          <AutoTrackMarqueeBanner message={autoTrackMessage} />
        ) : null}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.trackButton}
            onPress={trackOrder}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="Track Order"
          >
            <AppText style={styles.trackButtonText}>Track Order</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={goHome}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="Home"
          >
            <AppText style={styles.homeButtonText}>Home</AppText>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SOFT_BG },
  bodyLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  greenPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    overflow: "visible",
    zIndex: 3,
    alignItems: "stretch",
  },
  greenBody: {
    flex: 1,
    width: "100%",
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingBottom: 10,
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  heroCurveWrap: {
    width: "100%",
    alignItems: "center",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  splashTitleWrap: {
    position: "absolute",
    left: 22,
    right: 22,
    top: "42%",
    alignItems: "center",
  },
  splashTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
  },
  splashSeam: {
    position: "absolute",
    top: "58%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  receiptHeroCopy: {
    alignItems: "center",
    marginTop: 2,
    width: "100%",
    paddingBottom: 4,
  },
  brandEyebrowWrap: {
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  brandEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  paidLabel: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.95)",
    textAlign: "center",
  },
  amount: {
    marginTop: 0,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  statusUnderAmount: {
    marginTop: 6,
    marginBottom: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
  },
  sealWrap: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#064E3B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
  },
  infoCard: {
    marginHorizontal: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(17, 24, 39, 0.06)",
    gap: 16,
  },
  loadingRow: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { fontSize: 13, color: GatiMitraColors.textSecondary },
  detailGrid: {
    flexDirection: "row",
    gap: 18,
  },
  detailColumn: { flex: 1, minWidth: 0 },
  detailLabel: {
    marginBottom: 6,
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
  },
  detailValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailValue: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  deliveryCardWrap: {
    marginHorizontal: 16,
    marginTop: 6,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    paddingTop: 8,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  autoTrackBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF9C3",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FDE68A",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 8,
    minHeight: 28,
  },
  autoTrackIcon: { marginRight: 5 },
  autoTrackMarquee: { flex: 1, overflow: "hidden" },
  autoTrackText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#854D0E",
    flexShrink: 0,
  },
  bottomActions: {
    flexDirection: "row",
    gap: 12,
  },
  trackButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: "#111827",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  trackButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  homeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  homeButtonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  invalidScreen: {
    flex: 1,
    paddingHorizontal: 22,
    backgroundColor: SOFT_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  invalidTitle: {
    marginBottom: 18,
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  fullHomeButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  fullHomeButtonText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
