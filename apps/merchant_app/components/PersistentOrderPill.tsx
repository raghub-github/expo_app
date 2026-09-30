/**
 * Native overlay when the Partner build includes it.
 * Expo Go has no WindowManager overlay, so the same pill is drawn inside the app.
 */
import { useEffect, useState } from "react";
import { AppState, NativeModules, Platform, Pressable, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { getTextHost } from "@/lib/textHost";
import { MerchantFonts } from "@/constants/typography";
import {
  canDrawNativeOverlays,
  consumePersistentPillLaunch,
  setPersistentOrderPill,
} from "@gatimitra/expo-push-kit";
import { readMerchantOverlayAllowed } from "@/lib/androidBackgroundPermissions";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/hooks/useOrders";
import { useIncomingOrderSheetOptional } from "@/context/IncomingOrderSheetContext";

const nativePill = NativeModules.GatimitraOrderAlert?.setPersistentPill != null;
const HOME_OVERLAY_DEVICE_KEY = "mx_home_overlay_orders_device_v1";

export default function PersistentOrderPill() {
  const { isAuthenticated } = useAuth();
  const { orders } = useOrders();
  const sheet = useIncomingOrderSheetOptional();
  const [nativeOverlay, setNativeOverlay] = useState(false);
  const [overlayAllowed, setOverlayAllowed] = useState(false);
  const pendingOrders = orders.filter((o) => o.status === "created");
  const pending = pendingOrders.length;
  const focusId = pending === 1 ? String(pendingOrders[0]?.id ?? "") : "";

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let cancelled = false;
    const sync = async () => {
      if (!isAuthenticated) {
        setOverlayAllowed(false);
        setNativeOverlay(false);
        await setPersistentOrderPill(false, 0, "");
        return;
      }
      const homePref = await SecureStore.getItemAsync(HOME_OVERLAY_DEVICE_KEY);
      const homeOverlayOn = homePref !== "0";
      const nativeAllowed = nativePill ? await canDrawNativeOverlays() : null;
      const osAllowed = await readMerchantOverlayAllowed();
      const allowed = homeOverlayOn && (nativeAllowed === true || osAllowed === true);
      if (cancelled) return;
      const on = allowed === true;
      setOverlayAllowed(on);
      setNativeOverlay(on && nativePill);
      await setPersistentOrderPill(on && nativePill, pending, focusId);
    };
    void sync();
    const sub = AppState.addEventListener("change", () => {
      void sync();
    });
    const tick = setInterval(() => {
      void sync();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      sub.remove();
    };
  }, [isAuthenticated, pending, focusId]);

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

  // In-app circle is only a stand-in when Android has allowed Appear on top
  // and this build cannot draw the home-screen overlay. Production uses that overlay.
  if (!isAuthenticated || !overlayAllowed || nativeOverlay || nativePill) return null;

  const Brand = getTextHost();

  const open = () => {
    router.push("/(tabs)/orders");
    if (pending > 0) sheet?.reopenParkedIncomingOrders();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={styles.pill} onPress={open} accessibilityRole="button">
        <Brand style={styles.brand} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          GatiMitra
        </Brand>
      </Pressable>
      {pending > 0 ? (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{pending > 9 ? "9+" : pending}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 10,
    top: "46%",
    width: 70,
    height: 70,
    zIndex: 50,
    elevation: 12,
  },
  pill: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
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
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
});
