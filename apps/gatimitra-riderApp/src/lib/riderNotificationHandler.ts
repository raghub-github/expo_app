/**
 * Rider foreground presentation — OS shade is independent of the in-app pill UI.
 *
 * NEW_ORDER / dispatch:
 *   • App OPEN — show shade; mute OS channel sound (IncomingRideOrderHost owns chime).
 *   • App BACKGROUND — shade + channel sound (handler still runs while process alive).
 *   • App KILLED — this handler does not run; FCM notification block + channel sound.
 *
 * Never gate shouldShowAlert / shouldShowBanner on FloatingInAppBannerHost.
 */
import { AppState } from "react-native";
import { isRiderDispatchOfferPushData } from "@/src/lib/riderDispatchOfferChannel";

export async function installRiderForegroundNotificationHandler(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = (notification?.request?.content?.data ?? {}) as Record<string, unknown>;
        const isDispatch = isRiderDispatchOfferPushData(data);
        const appActive = AppState.currentState === "active";
        // Dispatch: always present in OS tray. Mute OS only while open (JS modal owns sound).
        const suppressOsSound = isDispatch && appActive;
        return {
          shouldShowAlert: true,
          shouldPlaySound: !suppressOsSound,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });
  } catch {
    /* Expo Go / missing native module */
  }
}
