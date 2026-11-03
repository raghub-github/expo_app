/**
 * Native overlay when the Partner build includes it.
 * Expo Go has no WindowManager overlay, so the same pill is drawn inside the app.
 *
 * Dismissal is session-scoped (module memory) — never SecureStore.
 * Preference + Android Appear-on-top are separate; effective = both && !dismissed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  DeviceEventEmitter,
  NativeModules,
  PanResponder,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { getTextHost } from "@/lib/textHost";
import { MerchantFonts } from "@/constants/typography";
import { consumePersistentPillLaunch, setPersistentOrderPill } from "@gatimitra/expo-push-kit";
import {
  HOME_OVERLAY_CHANGED_EVENT,
  markHomeOverlaySessionDismissed,
  syncHomeOverlayNativePill,
} from "@/lib/homeOverlayOrderCount";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/hooks/useOrders";
import { useIncomingOrderSheetOptional } from "@/context/IncomingOrderSheetContext";

const nativePill = NativeModules.GatimitraOrderAlert?.setPersistentPill != null;
/** Premium dark-black circle (matches native OrderAlertPill). */
const PILL_FILL = "#111111";
const PILL_SIZE = 62;

export default function PersistentOrderPill() {
  const { isAuthenticated } = useAuth();
  const { orders } = useOrders();
  const sheet = useIncomingOrderSheetOptional();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [nativeOverlay, setNativeOverlay] = useState(false);
  const [overlayAllowed, setOverlayAllowed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overDismiss, setOverDismiss] = useState(false);
  const pendingOrders = orders.filter((o) => o.status === "created");
  const pending = pendingOrders.length;
  const focusId = pending === 1 ? String(pendingOrders[0]?.id ?? "") : "";

  const initialX = Math.max(10, screenW - 72);
  const initialY = screenH * 0.46;
  const pos = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const originRef = useRef({ x: initialX, y: initialY });
  const movedRef = useRef(false);
  const overDismissRef = useRef(false);
  const metricsRef = useRef({ screenW, screenH, pending });
  metricsRef.current = { screenW, screenH, pending };
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const dismissZone = useMemo(
    () => ({
      x: screenW / 2 - 32,
      y: screenH - 100,
      size: 64,
    }),
    [screenW, screenH]
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let cancelled = false;
    const sync = async () => {
      if (!isAuthenticated) {
        setOverlayAllowed(false);
        setNativeOverlay(false);
        setDismissed(false);
        try {
          await setPersistentOrderPill(false, 0, "");
        } catch {
          /* ignore */
        }
        return;
      }
      const snap = await syncHomeOverlayNativePill(pending, focusId);
      if (cancelled) return;
      setOverlayAllowed(snap.toggleOn);
      setNativeOverlay(snap.toggleOn && nativePill);
      setDismissed(snap.sessionDismissed);
      if (!snap.sessionDismissed) pillOpacity.setValue(1);
    };
    void sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    const prefSub = DeviceEventEmitter.addListener(HOME_OVERLAY_CHANGED_EVENT, () => {
      void sync();
    });
    return () => {
      cancelled = true;
      sub.remove();
      prefSub.remove();
    };
  }, [isAuthenticated, pending, focusId, pillOpacity]);

  useEffect(() => {
    if (Platform.OS !== "android" || !isAuthenticated || !nativePill) return;
    let cancelled = false;
    const openFromPill = async () => {
      const launch = await consumePersistentPillLaunch();
      if (cancelled || !launch) return;
      router.push("/(tabs)/orders");
      if (launch.count > 0) sheet?.reopenParkedIncomingOrders();
    };
    void openFromPill();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void openFromPill();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [isAuthenticated, sheet]);

  const open = useCallback(() => {
    router.push("/(tabs)/orders");
    if (metricsRef.current.pending > 0) sheetRef.current?.reopenParkedIncomingOrders();
  }, []);

  const dismissInApp = useCallback(() => {
    Animated.timing(pillOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      markHomeOverlaySessionDismissed();
      setDismissed(true);
      setDragging(false);
      setOverDismiss(false);
    });
  }, [pillOpacity]);

  const hitDismiss = useCallback((x: number, y: number, zone: typeof dismissZone) => {
    const cx = x + PILL_SIZE / 2;
    const cy = y + PILL_SIZE / 2;
    const pad = 14;
    return (
      cx >= zone.x - pad &&
      cx <= zone.x + zone.size + pad &&
      cy >= zone.y - pad &&
      cy <= zone.y + zone.size + pad
    );
  }, []);

  const openRef = useRef(open);
  openRef.current = open;
  const dismissRef = useRef(dismissInApp);
  dismissRef.current = dismissInApp;
  const zoneRef = useRef(dismissZone);
  zoneRef.current = dismissZone;
  const hitRef = useRef(hitDismiss);
  hitRef.current = hitDismiss;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          movedRef.current = false;
          overDismissRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          const { screenW: w, screenH: h } = metricsRef.current;
          if (Math.abs(g.dx) + Math.abs(g.dy) > 8) {
            movedRef.current = true;
            setDragging(true);
          }
          const nx = Math.max(8, Math.min(w - PILL_SIZE - 8, originRef.current.x + g.dx));
          const ny = Math.max(8, Math.min(h - PILL_SIZE - 8, originRef.current.y + g.dy));
          pos.setValue({ x: nx, y: ny });
          const hot = hitRef.current(nx, ny, zoneRef.current);
          overDismissRef.current = hot;
          setOverDismiss(hot);
        },
        onPanResponderRelease: (_, g) => {
          const { screenW: w, screenH: h } = metricsRef.current;
          if (!movedRef.current) {
            setDragging(false);
            openRef.current();
            return;
          }
          const nx = Math.max(8, Math.min(w - PILL_SIZE - 8, originRef.current.x + g.dx));
          const ny = Math.max(8, Math.min(h - PILL_SIZE - 8, originRef.current.y + g.dy));
          originRef.current = { x: nx, y: ny };
          if (overDismissRef.current) {
            dismissRef.current();
            return;
          }
          setDragging(false);
          setOverDismiss(false);
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          setOverDismiss(false);
        },
      }),
    [pos]
  );

  // In-app circle is only a stand-in when Android has allowed Appear on top
  // and this build cannot draw the home-screen overlay. Production uses that overlay.
  if (!isAuthenticated || !overlayAllowed || nativeOverlay || nativePill || dismissed) return null;

  const Brand = getTextHost();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {dragging ? (
        <View
          pointerEvents="none"
          style={[
            styles.dismissTarget,
            {
              left: dismissZone.x,
              top: dismissZone.y,
              backgroundColor: overDismiss ? "#DC2626" : "#B91C1C",
              transform: [{ scale: overDismiss ? 1.08 : 1 }],
            },
          ]}
        >
          <Text style={styles.dismissX}>×</Text>
        </View>
      ) : null}
      <Animated.View
        style={[
          styles.wrap,
          {
            transform: pos.getTranslateTransform(),
            opacity: pillOpacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.pill} accessibilityRole="button">
          <Brand style={styles.brand} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            GatiMitra
          </Brand>
        </View>
        {pending > 0 ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{pending > 9 ? "9+" : pending}</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 70,
    height: 70,
    zIndex: 50,
    elevation: 12,
  },
  pill: {
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: PILL_SIZE / 2,
    backgroundColor: PILL_FILL,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  brand: {
    color: "#FFFFFF",
    fontFamily: MerchantFonts.loraBold,
    fontSize: 11,
    textAlign: "center",
    letterSpacing: 0.2,
    includeFontPadding: false,
    width: "100%",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#E11D48",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    zIndex: 20,
    elevation: 16,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  dismissTarget: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#7F1D1D",
    zIndex: 60,
    elevation: 20,
  },
  dismissX: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
    includeFontPadding: false,
  },
});
