/**
 * Ongoing tray row while a rider is ON duty and has no active order.
 *
 * Android shade cannot host the in-app animated SVG radar — only title text
 * (+ optional system icon). Keep copy to a single line: "📡 Searching for orders".
 */
import { Platform } from "react-native";

export const RIDER_SEARCHING_NOTIFICATION_ID = "rider-searching-orders";
const CHANNEL_ID = "rider_searching_orders";

/** Matches RadarTargetIcon sweep red (tints the small status-bar icon when supported). */
const RADAR_ACCENT = "#DC2626";

const TITLE = "📡 Searching for orders";

let lastPosted = false;

async function notifications() {
  return import("expo-notifications");
}

export async function dismissRiderSearchingNotification(): Promise<void> {
  if (Platform.OS !== "android") return;
  lastPosted = false;
  try {
    const Notifications = await notifications();
    await Notifications.dismissNotificationAsync(RIDER_SEARCHING_NOTIFICATION_ID);
  } catch {
    /* already gone */
  }
}

export async function showRiderSearchingNotification(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const Notifications = await notifications();
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Searching for orders",
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      vibrationPattern: undefined,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.scheduleNotificationAsync({
      identifier: RIDER_SEARCHING_NOTIFICATION_ID,
      content: {
        title: TITLE,
        // No subtitle / no body — user wants only "📡 Searching for orders".
        data: {
          type: "RIDER_SEARCHING",
          url: "/(tabs)/orders",
        },
        sticky: true,
        autoDismiss: false,
        color: RADAR_ACCENT,
        priority: Notifications.AndroidNotificationPriority.LOW,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    lastPosted = true;
  } catch {
    lastPosted = false;
  }
}

export function isRiderSearchingNotificationPosted(): boolean {
  return lastPosted;
}
