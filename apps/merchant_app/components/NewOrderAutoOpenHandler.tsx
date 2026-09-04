/**
 * When a new-order push arrives while the app is backgrounded / process still
 * alive, wake Partner and open Home → New tab (not order detail).
 * Killed + force-stopped devices still show a MAX-importance heads-up; tap /
 * FSI (USE_FULL_SCREEN_INTENT) opens the app.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { wakeMerchantAppForOrder } from "@/lib/androidBackgroundPermissions";
import { merchantHomeNewOrdersHref } from "@/lib/merchantNavigation";
import { registerMerchantForegroundPushHandler } from "@/lib/merchantPushDispatch";
import {
  MERCHANT_NEW_ORDER_CHANNEL_ID,
  MERCHANT_NEW_ORDER_SOUND,
  isMerchantNewOrderPushData,
} from "@/lib/merchantNewOrderChannel";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function orderPathFromData(_data: Record<string, unknown>): string | null {
  return merchantHomeNewOrdersHref().replace(/^\//, "");
}

export default function NewOrderAutoOpenHandler() {
  const lastWakeKeyRef = useRef<string>("");

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;

    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        // Versioned channel — sound is immutable after first Android create.
        await Notifications.setNotificationChannelAsync(MERCHANT_NEW_ORDER_CHANNEL_ID, {
          name: "New order alerts",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 400, 200, 400],
          lightColor: "#3EB489",
          sound: MERCHANT_NEW_ORDER_SOUND,
          bypassDnd: false,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          enableVibrate: true,
        });
        await Notifications.setNotificationChannelAsync("merchant_new_orders", {
          name: "New orders",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 400, 200, 400],
          lightColor: "#3EB489",
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          enableVibrate: true,
        });
        await Notifications.setNotificationChannelAsync("merchant_order_lifecycle", {
          name: "Order updates",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#3EB489",
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          enableVibrate: true,
        });
        await Notifications.setNotificationChannelAsync("merchant_online", {
          name: "Store online status",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#3EB489",
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          enableVibrate: true,
        });
      } catch {
        /* expo-notifications unavailable */
      }
    })();

    return registerMerchantForegroundPushHandler(({ data }) => {
      if (!isMerchantNewOrderPushData(data)) return;

      const path = orderPathFromData(data);
      if (!path) return;

      const key = `${path}:${String(data.notification_id ?? data.foodOrderId ?? data.orderId ?? "")}`;
      if (lastWakeKeyRef.current === key) return;
      lastWakeKeyRef.current = key;

      if (AppState.currentState === "active") return;

      void wakeMerchantAppForOrder(path);
    });
  }, []);

  return null;
}
