/**
 * After notifications are allowed, Android's own dialogs run once:
 * ignore-battery-optimizations, then Appear on top.
 * No in-app card. A prompt is not opened again after the user returns.
 */
import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import {
  openMerchantBatteryOptimizationSettings,
  readMerchantBatteryUnrestricted,
} from "@/lib/androidBackgroundPermissions";
import { useAuth } from "@/context/AuthContext";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";
import { readMerchantNotificationPermission } from "@/lib/merchantNotificationPermission";

let batteryPrompted = false;

export default function BackgroundOrderPermissionsGate() {
  const { token, isAuthenticated } = useAuth();
  const { notificationsGranted, bgGateNonce } = useNotificationPermissionGate();
  const loggedIn = Boolean(token || isAuthenticated);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (Platform.OS !== "android" || !loggedIn || running.current) return;
    const notif = await readMerchantNotificationPermission();
    if (notif.osStatus !== "granted") return;

    running.current = true;
    try {
      if (!batteryPrompted) {
        const battery = await readMerchantBatteryUnrestricted();
        batteryPrompted = true;
        if (battery !== true) {
          await openMerchantBatteryOptimizationSettings("request");
        }
      }
    } catch (error) {
      if (__DEV__) console.warn("[permissions] background gate failed", error);
    } finally {
      running.current = false;
    }
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || Platform.OS !== "android") return;
    if (!notificationsGranted && bgGateNonce === 0) return;
    void run();
  }, [loggedIn, notificationsGranted, bgGateNonce, run]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void run();
    });
    return () => sub.remove();
  }, [run]);

  return null;
}
