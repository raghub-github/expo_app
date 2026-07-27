/**
 * Reliable Android notification permission read — does not depend solely on
 * expo-notifications (which is unavailable in Expo Go and can lag behind the
 * system “Allow notifications” master toggle).
 */
import { PermissionsAndroid, Platform } from "react-native";
import Constants from "expo-constants";

export type MerchantNotifOsStatus = "granted" | "denied" | "blocked" | "undetermined";

export type MerchantNotifPermission = {
  osStatus: MerchantNotifOsStatus;
  canAskAgain: boolean;
  source: "expo-notifications" | "permissions-android" | "legacy-android" | "unavailable";
};

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/**
 * Android 13+ (API 33): POST_NOTIFICATIONS.
 * Older Android: install-time grant (treat as granted unless expo says otherwise).
 */
async function readAndroidNative(): Promise<MerchantNotifPermission | null> {
  if (Platform.OS !== "android") return null;
  const api = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);

  if (api >= 33) {
    try {
      const ok = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (ok) {
        return { osStatus: "granted", canAskAgain: false, source: "permissions-android" };
      }
      return { osStatus: "denied", canAskAgain: true, source: "permissions-android" };
    } catch {
      return null;
    }
  }

  // Pre-33: no runtime notif permission — channels can still be disabled in Settings.
  return { osStatus: "granted", canAskAgain: false, source: "legacy-android" };
}

async function readExpoNotifications(): Promise<MerchantNotifPermission | null> {
  if (isExpoGo()) return null;
  try {
    const Notifications = await import("expo-notifications");
    const result = await Notifications.getPermissionsAsync();
    const canAskAgain = result.canAskAgain !== false;
    if (result.status === "granted") {
      return { osStatus: "granted", canAskAgain: false, source: "expo-notifications" };
    }
    if (result.status === "denied") {
      return {
        osStatus: canAskAgain ? "denied" : "blocked",
        canAskAgain,
        source: "expo-notifications",
      };
    }
    return {
      osStatus: "undetermined",
      canAskAgain,
      source: "expo-notifications",
    };
  } catch {
    return null;
  }
}

/**
 * Prefer the stricter of native POST_NOTIFICATIONS vs expo-notifications.
 * If either says not granted, treat as not granted (matches Settings toggle).
 */
export async function readMerchantNotificationPermission(): Promise<MerchantNotifPermission> {
  const [expo, native] = await Promise.all([readExpoNotifications(), readAndroidNative()]);

  if (Platform.OS === "android") {
    // Native POST_NOTIFICATIONS is the source of truth on API 33+.
    if (native && native.source === "permissions-android") {
      // If native denied but expo somehow says granted, still denied.
      if (native.osStatus !== "granted") return native;
      // Native granted — trust it (even if expo module missing in Expo Go).
      return native;
    }
    if (expo) return expo;
    if (native) return native;
    return { osStatus: "undetermined", canAskAgain: true, source: "unavailable" };
  }

  // iOS — expo only
  if (expo) return expo;
  return { osStatus: "undetermined", canAskAgain: true, source: "unavailable" };
}

export async function requestMerchantNotificationPermission(): Promise<MerchantNotifPermission> {
  if (Platform.OS === "android") {
    const api = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);
    if (api >= 33) {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          return { osStatus: "granted", canAskAgain: false, source: "permissions-android" };
        }
        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          return { osStatus: "blocked", canAskAgain: false, source: "permissions-android" };
        }
        return { osStatus: "denied", canAskAgain: true, source: "permissions-android" };
      } catch {
        /* fall through to expo */
      }
    }
  }

  if (!isExpoGo()) {
    try {
      const Notifications = await import("expo-notifications");
      const result = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      const canAskAgain = result.canAskAgain !== false;
      if (result.status === "granted") {
        return { osStatus: "granted", canAskAgain: false, source: "expo-notifications" };
      }
      return {
        osStatus: canAskAgain ? "denied" : "blocked",
        canAskAgain,
        source: "expo-notifications",
      };
    } catch {
      /* ignore */
    }
  }

  return readMerchantNotificationPermission();
}
