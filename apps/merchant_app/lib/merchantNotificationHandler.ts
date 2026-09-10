/**
 * Foreground presentation for Partner: every remote event goes to the OS
 * shade. Only the legacy `live_orders` id is suppressed (migrated to STORE_STATUS).
 *
 * NEW_ORDER sound ownership (production):
 *   • App OPEN (active) — mute OS channel; Incoming Order modal / JS chime only.
 *   • App BACKGROUND (process alive) — OS `merchant_new_orders_alert` plays;
 *     JS does not start until the merchant opens the app or taps the tray.
 *   • App KILLED — this handler does not run; FCM notification block + channel sound.
 *
 * STORE_STATUS sticky (Waiting / Prep·Ready·Out):
 *   Must ALWAYS remain in the shade list — even while the app is open —
 *   otherwise kitchen progress updates are silently dropped and the tray
 *   stays stuck on "Waiting for orders".
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
        // Legacy kitchen id only — STORE_STATUS is the live sticky now.
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
        if (isStoreStatus) {
          const state = String(data.state ?? data.storeState ?? "").toUpperCase();
          const headsUp =
            state === "OUT_OF_TIMINGS" ||
            state === "OUT_OF_DELIVERY_TIMINGS" ||
            state === "RECONNECT" ||
            state === "RECONNECT_REQUIRED";
          return {
            shouldShowAlert: true,
            shouldPlaySound: headsUp,
            shouldSetBadge: false,
            // Offline heads-up; ONLINE sticky must still land in the shade while open.
            shouldShowBanner: headsUp || !appActive,
            shouldShowList: true,
          };
        }
        // New order: shade always. Mute OS only while app is open (JS/modal owns sound).
        // Background → OS channel sound. Killed → handler never runs (FCM owns sound).
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
