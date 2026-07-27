/**
 * Persistent tray notification while the store is online (Zomato-style):
 *   Title: 🟢 {Store Name}
 *   Body:  Waiting for orders
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useAuth } from "@/context/AuthContext";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";

const ONLINE_NOTIF_ID = "merchant-store-online-status";
const ONLINE_BODY = "Waiting for orders";
const POLL_MS = 12_000;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function onlineTitle(storeName: string): string {
  const name = storeName.trim() || "Your restaurant";
  return `🟢 ${name}`;
}

async function showOnlineTrayNotification(storeName: string): Promise<void> {
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
        title: onlineTitle(storeName),
        body: ONLINE_BODY,
        data: { type: "store_online", screen: "orders" },
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
  const storeName = selectedStore?.store_name?.trim() || "Your restaurant";
  const showingRef = useRef(false);
  const lastTitleRef = useRef("");

  useEffect(() => {
    if (!token || !storeId) {
      if (showingRef.current) {
        showingRef.current = false;
        lastTitleRef.current = "";
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
            lastTitleRef.current = "";
            await dismissOnlineTrayNotification();
          }
          return;
        }
        const active = await getActiveOrdersCount(storeId, token);
        if (cancelled) return;
        if (active > 0) {
          if (showingRef.current) {
            showingRef.current = false;
            lastTitleRef.current = "";
            await dismissOnlineTrayNotification();
          }
          return;
        }
        const title = onlineTitle(storeName);
        // Show or refresh when missing / store name changed (same id replaces the row).
        if (!showingRef.current || lastTitleRef.current !== title) {
          showingRef.current = true;
          lastTitleRef.current = title;
          await showOnlineTrayNotification(storeName);
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
        lastTitleRef.current = "";
        void dismissOnlineTrayNotification();
      }
    };
  }, [token, storeId, isOnline, storeName]);

  return null;
}
