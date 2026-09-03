/**
 * Foreground presentation for Partner: every remote event goes to the OS
 * shade (old merchant-app behaviour). Only the local kitchen sticky is
 * suppressed so it does not double-chime as a heads-up.
 *
 * New-order pushes while the app is ACTIVE: suppress OS sound — the accept
 * modal / OrderAlertPushHandler play the bundled alert once.
 * Background / locked (JS still alive): allow sound so the tray is not
 * silent; killed delivery uses the Android channel sound from FCM.
 */
import { AppState } from "react-native";
import { isMerchantIdleStatusNotification } from "@/lib/merchantStatusNotification";
import { isMerchantNewOrderPushData } from "@/lib/merchantNewOrderChannel";

export async function installMerchantForegroundNotificationHandler(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = (notification?.request?.content?.data ?? {}) as Record<string, unknown>;
        const t = String(data.type ?? data.notificationType ?? "").toLowerCase();
        if (isMerchantIdleStatusNotification(data) || t === "live_orders") {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
          };
        }
        const isOffline = t === "offline_network";
        const isNewOrder = isMerchantNewOrderPushData(data);
        const appActive = AppState.currentState === "active";
        // Only mute the OS chime when the in-app alert path will own it.
        const suppressOsSound = isOffline || (isNewOrder && appActive);
        return {
          shouldShowAlert: true,
          shouldPlaySound: !suppressOsSound,
          shouldSetBadge: !isOffline,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    /* Expo Go / missing native module */
  }
}
