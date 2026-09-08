/**
 * Foreground presentation for Partner: every remote event goes to the OS
 * shade. Only the local kitchen sticky is suppressed so it does not
 * double-chime as a heads-up.
 *
 * NEW_ORDER sound ownership:
 *   • App ACTIVE  — mute OS channel sound; NewOrderAlertManager plays
 *     the merchant-configured repeating chime.
 *   • App NOT active (background / cached / headless) — NEVER mute OS
 *     sound. Native FCM + merchant_new_orders_alert is the audible owner
 *     so a killed/cached process cannot swallow the alert.
 *   • Process dead — this handler does not run; Android shows the FCM
 *     notification block with the channel sound.
 */
import { AppState } from "react-native";
import { isMerchantIdleStatusNotification } from "@/lib/merchantStatusNotification";
import { isMerchantNewOrderPushData } from "@/lib/merchantNewOrderChannel";
import { isStoreStatusPushData } from "@/lib/storeStatusNotification";

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
        const isStoreStatus = isStoreStatusPushData(data);
        const isOffline = t === "offline_network";
        const isNewOrder = isMerchantNewOrderPushData(data);
        const appActive = AppState.currentState === "active";
        // Status tray is quiet. While JS is active it owns the sticky so the
        // FCM copy is not shown as a second row. When JS is not active, native
        // FCM must still render (this handler may not even run).
        if (isStoreStatus) {
          return {
            shouldShowAlert: !appActive,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: !appActive,
            shouldShowList: !appActive,
          };
        }
        // Only the in-app alert owns the chime while the merchant is looking
        // at the app. Any other state must keep the native NEW_ORDER sound.
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
