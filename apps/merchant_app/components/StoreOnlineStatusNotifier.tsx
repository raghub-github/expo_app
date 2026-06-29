/**
 * Persistent tray notification while the store is online (Zomato-style
 * "Your restaurant is online / Waiting for orders").
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useAuth } from "@/context/AuthContext";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";

const ONLINE_NOTIF_ID = "merchant-store-online-status";
const ONLINE_TITLE = "🟢 Your restaurant is online";
const ONLINE_BODY = "Waiting for orders";
const POLL_MS = 12_000;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

async function showOnlineTrayNotification(): Promise<void> {
  if (isExpoGo()) return;
  try {
    const Notifications = await import("expo-notifications");
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("merchant_online", {
        name: "Store online status",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0],
        lightColor: "#3EB489",
      });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: ONLINE_NOTIF_ID,
      content: {
        title: ONLINE_TITLE,
        body: ONLINE_BODY,
        data: { type: "store_online", screen: "notifications" },
        ...(Platform.OS === "android"
          ? {
              sticky: true,
              priority: Notifications.AndroidNotificationPriority.DEFAULT,
              channelId: "merchant_online",
            }
          : {}),
      },
      trigger: null,
    });
  } catch {
    /* best-effort */
  }
}

async function dismissOnlineTrayNotification(): Promise<void> {
  if (isExpoGo()) return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.dismissNotificationAsync(ONLINE_NOTIF_ID);
  } catch {
    /* best-effort */
  }
}

export default function StoreOnlineStatusNotifier() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline } = useStoreStatus();
  const storeId = selectedStore?.id ?? null;
  const showingRef = useRef(false);

  useEffect(() => {
    if (!token || !storeId) {
      if (showingRef.current) {
        showingRef.current = false;
        void dismissOnlineTrayNotification();
      }
      return undefined;
    }

    let cancelled = false;

    const sync = async () => {
      if (cancelled) return;
      try {
        if (!isOnline) {
          if (showingRef.current) {
            showingRef.current = false;
            await dismissOnlineTrayNotification();
          }
          return;
        }
        const active = await getActiveOrdersCount(storeId, token);
        if (cancelled) return;
        if (active > 0) {
          if (showingRef.current) {
            showingRef.current = false;
            await dismissOnlineTrayNotification();
          }
          return;
        }
        if (!showingRef.current) {
          showingRef.current = true;
          await showOnlineTrayNotification();
        }
      } catch {
        /* ignore */
      }
    };

    void sync();
    const id = setInterval(sync, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (showingRef.current) {
        showingRef.current = false;
        void dismissOnlineTrayNotification();
      }
    };
  }, [token, storeId, isOnline]);

  return null;
}
