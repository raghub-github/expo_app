/**
 * Order placed successfully — premium confirmation with a race-free 4s auto-redirect
 * to live tracking. Track Order / Back to Home cancel the timer immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  AppState,
  type AppStateStatus,
  useWindowDimensions,
  Platform,
  StatusBar as NativeStatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { orderService } from "@/services/order.service";
import { LegalFooter } from "@/components/LegalLinks";
import { DeliveryAddressText } from "@/components/address/DeliveryAddressText";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const PAD = 20;
const CARD_RADIUS = 20;
const AUTO_REDIRECT_SEC = 4;
/** Header / status-bar chrome — matches premium success hero (never white). */
const HERO_GREEN = GatiMitraColors.splashMint;
const HERO_GREEN_DEEP = "#0d9488";

function WaveBottom({ width }: { width: number }) {
  const w = Math.max(320, width);
  const h = 28;
  const d = [
    `M 0 0`,
    `L 0 ${h * 0.35}`,
    `C ${w * 0.25} ${h * 1.15} ${w * 0.75} ${-h * 0.15} ${w} ${h * 0.4}`,
    `L ${w} 0`,
    `Z`,
  ].join(" ");
  return (
    <Svg width={w} height={h} style={styles.wave} pointerEvents="none">
      <Path d={d} fill={HERO_GREEN} />
    </Svg>
  );
}

function OrderInfoRow({
  icon,
  label,
  value,
  valueColor = GatiMitraColors.textPrimary,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <View style={styles.infoIconWrap}>
          <Ionicons name={icon} size={18} color={HERO_GREEN_DEEP} />
        </View>
        <AppText style={styles.infoLabel}>{label}</AppText>
      </View>
      <AppText style={[styles.infoValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function isTerminalOrderStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toUpperCase();
  return (
    s.includes("CANCEL") ||
    s === "FAILED" ||
    s === "REJECTED" ||
    s === "PAYMENT_FAILED"
  );
}

export default function OrderSuccessScreen() {
  const {
    orderId: orderIdParam,
    formattedOrderId: formattedOrderIdParam,
    merchantName: paramMerchantName,
    etaMinutes: paramEtaMinutes,
    deliveryEtaLabel: paramDeliveryEtaLabel,
  } = useLocalSearchParams();
  const route = useRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REDIRECT_SEC);

  const navigatedRef = useRef(false);
  const cancelledRef = useRef(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingMsRef = useRef(AUTO_REDIRECT_SEC * 1000);
  const deadlineRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const fromUrl = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const fromFormattedUrl = Array.isArray(formattedOrderIdParam)
    ? formattedOrderIdParam[0]
    : formattedOrderIdParam;
  const fromParams = (route.params as { orderId?: string } | undefined)?.orderId;
  const id = (fromUrl ?? fromParams ?? "").toString();
  const merchantName =
    (route.params as { merchantName?: string } | undefined)?.merchantName ??
    (paramMerchantName as string | undefined);
  const etaFromParams =
    (route.params as { etaMinutes?: number } | undefined)?.etaMinutes ??
    (paramEtaMinutes != null ? Number(paramEtaMinutes) : undefined);
  const deliveryEtaLabelFromParams =
    (route.params as { deliveryEtaLabel?: string } | undefined)?.deliveryEtaLabel ??
    (typeof paramDeliveryEtaLabel === "string" ? paramDeliveryEtaLabel.trim() : "");

  const { data: order } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderService.getOrder(id),
    enabled: !!id,
  });

  const clearTimers = useCallback(() => {
    if (redirectTimeoutRef.current != null) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current != null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    deadlineRef.current = null;
  }, []);

  const navigateOnce = useCallback(
    (target: "tracking" | "home") => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      cancelledRef.current = true;
      clearTimers();
      if (target === "home") {
        router.replace("/(tabs)/" as const);
        return;
      }
      if (!id) {
        router.replace("/(tabs)/" as const);
        return;
      }
      router.replace(`/orders/${id}` as const);
    },
    [clearTimers, id, router]
  );

  const startCountdown = useCallback(
    (ms: number) => {
      clearTimers();
      if (cancelledRef.current || navigatedRef.current || !id) return;

      remainingMsRef.current = Math.max(0, ms);
      setSecondsLeft(Math.max(1, Math.ceil(remainingMsRef.current / 1000)));
      deadlineRef.current = Date.now() + remainingMsRef.current;

      countdownIntervalRef.current = setInterval(() => {
        if (pausedRef.current || cancelledRef.current) return;
        const left = Math.max(0, (deadlineRef.current ?? Date.now()) - Date.now());
        remainingMsRef.current = left;
        setSecondsLeft(Math.max(0, Math.ceil(left / 1000)));
      }, 250);

      redirectTimeoutRef.current = setTimeout(() => {
        if (cancelledRef.current || navigatedRef.current || pausedRef.current) return;
        navigateOnce("tracking");
      }, remainingMsRef.current);
    },
    [clearTimers, id, navigateOnce]
  );

  // Status bar matches green hero — never white on this screen.
  useFocusEffect(
    useCallback(() => {
      useScreenChromeStore.setState({
        statusBarBackground: HERO_GREEN,
        statusBarStyle: "light",
        hideStatusBarSpacer: true,
      });
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        NativeStatusBar.setBackgroundColor(HERO_GREEN, true);
        NativeStatusBar.setBarStyle("light-content", true);
      }
      return () => {
        cancelledRef.current = true;
        clearTimers();
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [clearTimers])
  );

  // Start countdown once per order id.
  useEffect(() => {
    if (!id) return;
    navigatedRef.current = false;
    cancelledRef.current = false;
    pausedRef.current = false;
    startCountdown(AUTO_REDIRECT_SEC * 1000);
    return () => {
      cancelledRef.current = true;
      clearTimers();
    };
  }, [id, startCountdown, clearTimers]);

  // Pause timer in background; resume without firing a stale redirect.
  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (cancelledRef.current || navigatedRef.current) return;

      if (state !== "active") {
        if (pausedRef.current) return;
        pausedRef.current = true;
        if (deadlineRef.current != null) {
          remainingMsRef.current = Math.max(0, deadlineRef.current - Date.now());
        }
        clearTimers();
        return;
      }

      if (!pausedRef.current) return;
      pausedRef.current = false;
      if (remainingMsRef.current <= 0) {
        navigateOnce("tracking");
        return;
      }
      startCountdown(remainingMsRef.current);
    };

    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [clearTimers, navigateOnce, startCountdown]);

  // If order is cancelled / failed before auto-redirect, go home instead of tracking.
  useEffect(() => {
    if (!order?.status) return;
    if (!isTerminalOrderStatus(order.status)) return;
    if (navigatedRef.current) return;
    navigateOnce("home");
  }, [order?.status, navigateOnce]);

  const goHome = () => navigateOnce("home");
  const trackOrder = () => navigateOnce("tracking");

  if (!id) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <AppText style={styles.errText}>Invalid order</AppText>
        <TouchableOpacity onPress={goHome} style={styles.trackBtn}>
          <AppText style={styles.trackBtnText}>Back to Home</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const displayDeliveryEta =
    deliveryEtaLabelFromParams ||
    (typeof etaFromParams === "number" && etaFromParams > 0 ? `${etaFromParams} mins` : null);
  const orderIdDisplay = order?.formattedOrderId ?? fromFormattedUrl ?? order?.orderId ?? id;
  const displayMerchantName = order?.merchantName ?? merchantName ?? "Your restaurant";
  const deliveryAddress = order?.deliveryAddress?.trim() ?? "";
  const countdownLabel = Math.max(secondsLeft, 0);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={HERO_GREEN} translucent />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
          <View style={[styles.heroFill, { paddingTop: insets.top + 20 }]}>
            <AppText style={styles.heroBrand}>GatiMitra</AppText>
            <View style={styles.heroDivider} />
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={40} color={HERO_GREEN_DEEP} />
            </View>
            <AppText style={styles.heroTitle}>Order placed successfully!</AppText>
            <AppText style={styles.heroSubtitle}>
              We&apos;ve received your order and will start preparing it soon.
            </AppText>
          </View>
          <WaveBottom width={winW} />
        </Animated.View>

        <View style={styles.body}>
          <Animated.View entering={FadeIn.duration(320).delay(80)} style={styles.card}>
            <OrderInfoRow
              icon="receipt-outline"
              label="Order ID"
              value={`#${orderIdDisplay}`}
              valueColor={HERO_GREEN_DEEP}
            />
            <OrderInfoRow
              icon="restaurant-outline"
              label="Restaurant"
              value={displayMerchantName}
              isLast={!displayDeliveryEta}
            />
            {displayDeliveryEta ? (
              <OrderInfoRow
                icon="time-outline"
                label="Estimated delivery"
                value={displayDeliveryEta}
                valueColor={HERO_GREEN_DEEP}
                isLast
              />
            ) : null}
          </Animated.View>

          {deliveryAddress ? (
            <Animated.View entering={FadeIn.duration(320).delay(140)} style={styles.addressCard}>
              <View style={styles.addressIconWrap}>
                <Ionicons name="location" size={20} color={HERO_GREEN_DEEP} />
              </View>
              <View style={styles.addressBody}>
                <AppText style={styles.addressLabel}>Delivery address</AppText>
                <DeliveryAddressText address={deliveryAddress} style={styles.addressText} />
              </View>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeIn.duration(320).delay(200)} style={styles.actions}>
            <TouchableOpacity
              onPress={trackOrder}
              style={styles.trackBtn}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Track Order"
            >
              <Ionicons name="navigate" size={20} color="#fff" />
              <AppText style={styles.trackBtnText}>Track Order</AppText>
            </TouchableOpacity>

            <View style={styles.redirectRow}>
              <View style={styles.redirectDot} />
              <AppText style={styles.autoRedirectHint}>
                Opening live order tracking in {countdownLabel} second
                {countdownLabel === 1 ? "" : "s"}…
              </AppText>
            </View>

            <TouchableOpacity
              onPress={goHome}
              style={styles.homeBtn}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
            >
              <Ionicons name="home-outline" size={20} color={GatiMitraColors.textPrimary} />
              <AppText style={styles.homeBtnText}>Back to Home</AppText>
            </TouchableOpacity>
          </Animated.View>

          <LegalFooter
            prefix="See"
            docIds={["shipping-delivery-policy", "refund-cancellation-policy"]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F3FBF9",
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3FBF9",
    paddingHorizontal: PAD,
  },
  errText: { fontSize: 16, color: GatiMitraColors.textSecondary, marginBottom: 16 },
  hero: {
    backgroundColor: HERO_GREEN,
    marginBottom: 8,
  },
  heroFill: {
    alignItems: "center",
    paddingHorizontal: PAD,
    paddingBottom: 8,
  },
  wave: {
    marginTop: -1,
  },
  heroBrand: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  heroDivider: {
    width: 56,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.55)",
    marginTop: 10,
    marginBottom: 18,
  },
  checkBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#0f766e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  body: {
    paddingHorizontal: PAD,
    marginTop: -4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.9)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraColors.border,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20,184,166,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
    maxWidth: "42%",
    textAlign: "right",
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.9)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
    gap: 12,
  },
  addressIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(20,184,166,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  addressBody: { flex: 1, minWidth: 0 },
  addressLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 19,
  },
  actions: { gap: 12, marginTop: 4, marginBottom: 8 },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: HERO_GREEN_DEEP,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: HERO_GREEN_DEEP,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  trackBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  redirectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
  },
  redirectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HERO_GREEN_DEEP,
  },
  autoRedirectHint: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    fontWeight: "500",
  },
  homeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  homeBtnText: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
});
