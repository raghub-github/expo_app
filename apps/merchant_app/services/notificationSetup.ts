import Constants from "expo-constants";
import { Platform } from "react-native";

const ANDROID_CHANNEL_ID = "merchant_default";

async function getNotificationsModule() {
  // IMPORTANT: expo-notifications import crashes/throws in Expo Go for remote push (SDK 53+).
  // So we only ever import it dynamically when not running in Expo Go.
  if (Constants.appOwnership === "expo") return null;
  const mod = await import("expo-notifications");
  return mod;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;
  const Device = await import("expo-device");
  if (!Device.isDevice) return false;

  // How to show notifications when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldAnnotate: true,
    }),
  });

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Store & Orders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3EB489",
  });
}

/** Returns Expo push token for this device; send to backend to receive pushes when app is in background. */
export async function getExpoPushToken(): Promise<string | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  const Device = await import("expo-device");
  if (!Device.isDevice) return null;
  const granted = await requestNotificationPermissions();
  if (!granted) return null;
  await setupAndroidChannel();
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData?.data ?? null;
  } catch {
    return null;
  }
}
