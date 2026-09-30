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
import { startRiderDispatchBuzzer } from "@/src/lib/nativeDispatchAlert";

function pushField(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

/** Same native buzzer the incoming accept modal starts. Idempotent per session. */
export async function startDispatchBuzzerFromPush(
  data: Record<string, unknown> | null | undefined
): Promise<boolean> {
  if (!data || !isRiderDispatchOfferPushData(data)) return false;
  const orderId = pushField(data, "orderId", "order_id", "offerId", "offer_id");
  if (!orderId) return false;
  try {
    return await startRiderDispatchBuzzer({
      orderId,
      riderId: pushField(data, "riderId", "rider_id") || null,
      waveNumber: pushField(data, "waveNumber", "wave_number") || null,
      serviceType: pushField(data, "serviceType", "service_type", "category") || null,
      alertSessionId: pushField(data, "alertSessionId", "alert_session_id") || null,
    });
  } catch {
    return false;
  }
}

export async function installRiderForegroundNotificationHandler(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = (notification?.request?.content?.data ?? {}) as Record<string, unknown>;
        const isDispatch = isRiderDispatchOfferPushData(data);
        const appActive = AppState.currentState === "active";
        let nativeOwns = false;
        if (isDispatch) {
          nativeOwns = await startDispatchBuzzerFromPush(data);
        }
        // Mute the tray tone only after the accept-modal buzzer is playing,
        // or while the in-app modal will play that same chime.
        const suppressOsSound = nativeOwns || (isDispatch && appActive);
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
