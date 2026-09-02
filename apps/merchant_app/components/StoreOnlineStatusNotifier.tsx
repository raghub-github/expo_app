/**
 * Legacy separate online notification id — kept mounted so upgrades clear old tray rows.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { dismissLiveOrdersOngoingNotification } from "@/lib/liveOrdersOngoingNotification";

const LEGACY_ONLINE_NOTIF_ID = "merchant-store-online-status";

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
