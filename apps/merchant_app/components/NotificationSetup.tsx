"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { requestNotificationPermissions, setupAndroidChannel, getExpoPushToken } from "@/services/notificationSetup";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { registerStorePushToken } from "@/services/pushTokenApi";
import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Enables background and foreground notifications: requests permission,
 * sets Android channel, obtains push token, and handles notification tap (e.g. open notifications screen).
 * Mount once in root layout.
 */
export default function NotificationSetup() {
  const router = useRouter();
  const { token: authToken } = useAuth();
  const { selectedStore } = useSelectedStore();
  const responseSubscriptionRef = useRef<{ remove?: () => void } | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Expo Go: skip expo-notifications entirely to avoid runtime crash (SDK 53+ removed remote push in Expo Go).
      if (Constants.appOwnership === "expo") return;
      await requestNotificationPermissions();
      await setupAndroidChannel();
      const token = await getExpoPushToken();
      if (mounted && token && authToken && selectedStore?.id) {
        try {
          await registerStorePushToken(selectedStore.id, token, authToken, Platform.OS);
        } catch {
          // best-effort
        }
      }
    })();

    (async () => {
      if (Constants.appOwnership === "expo") return;
      const Notifications = await import("expo-notifications");
      responseSubscriptionRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        if (data?.url && typeof data.url === "string") {
          router.push(data.url as any);
        } else if (data?.screen === "notifications") {
          router.push("/notifications");
        } else if (data?.orderId != null) {
          router.push(`/order/${String(data.orderId)}`);
        } else {
          router.push("/notifications");
        }
      });
    })();

    return () => {
      mounted = false;
      responseSubscriptionRef.current?.remove?.();
      responseSubscriptionRef.current = null;
    };
  }, [router]);

  return null;
}
