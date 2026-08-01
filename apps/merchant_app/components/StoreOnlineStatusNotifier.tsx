/**
 * Store-online sticky is now owned by LiveOrdersOngoingNotification
 * (single Zomato-style tray row for idle + busy). This component only
 * dismisses the legacy separate online notification id.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { LEGACY_ONLINE_NOTIF_ID } from "@/lib/liveOrdersOngoingNotification";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function StoreOnlineStatusNotifier() {
  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        await Notifications.dismissNotificationAsync(LEGACY_ONLINE_NOTIF_ID);
      } catch {
        /* best-effort */
      }
    })();
  }, []);

  return null;
}
