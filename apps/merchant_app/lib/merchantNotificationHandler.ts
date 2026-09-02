/**
 * Foreground presentation for Partner: every remote event goes to the OS
 * shade (old merchant-app behaviour). Only the local kitchen sticky is
 * suppressed so it does not double-chime as a heads-up.
 */
import { isMerchantIdleStatusNotification } from "@/lib/merchantStatusNotification";

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
        return {
          shouldShowAlert: true,
          shouldPlaySound: !isOffline,
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
