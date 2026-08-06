import Constants from "expo-constants";
import { Linking, PermissionsAndroid, Platform } from "react-native";
import type { PushOsPermissionStatus } from "./types";

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === "expo";
}

/**
 * Load expo-notifications only outside Expo Go.
 * Any import in Expo Go (SDK 53+) fires console.error about remote push being
 * removed — even when only local/permission APIs are used.
 */
export async function loadNotificationsModule(
  _opts?: { allowExpoGo?: boolean }
): Promise<typeof import("expo-notifications") | null> {
  try {
    // allowExpoGo is ignored on purpose: importing always triggers Expo Go's
    // DevicePushTokenAutoRegistration warning/error on Android.
    if (isExpoGoRuntime()) {
      return null;
    }
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

export type NotificationPermissionSnapshot = {
  osStatus: PushOsPermissionStatus;
  canAskAgain: boolean;
  rawStatus: string;
};

function mapOsStatus(
  status: string,
  canAskAgain: boolean | undefined
): PushOsPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "undetermined") return "undetermined";
  if (status === "denied") {
    // When the OS will not show the dialog again, treat as blocked.
    if (canAskAgain === false) return "blocked";
    return "denied";
  }
  return "undetermined";
}

function androidApiLevel(): number {
  return typeof Platform.Version === "number"
    ? Platform.Version
    : parseInt(String(Platform.Version), 10) || 0;
}

/**
 * Android 13+ POST_NOTIFICATIONS is the source of truth for the master
 * "Allow notifications" toggle — expo-notifications alone can lag or be missing.
 */
async function readAndroidNativePermission(): Promise<NotificationPermissionSnapshot | null> {
  if (Platform.OS !== "android") return null;
  if (androidApiLevel() < 33) {
    // Pre-33: install-time grant; channel can still be disabled in Settings.
    return { osStatus: "granted", canAskAgain: false, rawStatus: "legacy_android" };
  }
  try {
    const ok = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (ok) {
      return { osStatus: "granted", canAskAgain: false, rawStatus: "permissions_android" };
    }
    return { osStatus: "denied", canAskAgain: true, rawStatus: "permissions_android" };
  } catch {
    return null;
  }
}

async function requestAndroidNativePermission(): Promise<NotificationPermissionSnapshot | null> {
  if (Platform.OS !== "android" || androidApiLevel() < 33) return null;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      return { osStatus: "granted", canAskAgain: false, rawStatus: "permissions_android" };
    }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      return { osStatus: "blocked", canAskAgain: false, rawStatus: "permissions_android" };
    }
    return { osStatus: "denied", canAskAgain: true, rawStatus: "permissions_android" };
  } catch {
    return null;
  }
}

export async function readNotificationPermission(): Promise<NotificationPermissionSnapshot> {
  const [native, expoModule] = await Promise.all([
    readAndroidNativePermission(),
    loadNotificationsModule({ allowExpoGo: true }),
  ]);

  // Android 13+: native master toggle wins (matches Settings → Allow notifications).
  if (Platform.OS === "android" && native && native.rawStatus === "permissions_android") {
    if (native.osStatus !== "granted") return native;
    return native;
  }

  if (expoModule) {
    const result = await expoModule.getPermissionsAsync();
    const canAskAgain = result.canAskAgain !== false;
    return {
      osStatus: mapOsStatus(result.status, result.canAskAgain),
      canAskAgain,
      rawStatus: result.status,
    };
  }

  if (native) return native;
  return { osStatus: "undetermined", canAskAgain: true, rawStatus: "unavailable" };
}

export async function requestNotificationPermission(): Promise<NotificationPermissionSnapshot> {
  const native = await requestAndroidNativePermission();
  if (native?.osStatus === "granted") return native;
  if (native?.osStatus === "blocked") return native;

  const Notifications = await loadNotificationsModule({ allowExpoGo: true });
  if (Notifications) {
    const result = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    const canAskAgain = result.canAskAgain !== false;
    return {
      osStatus: mapOsStatus(result.status, result.canAskAgain),
      canAskAgain,
      rawStatus: result.status,
    };
  }

  if (native) return native;
  return { osStatus: "undetermined", canAskAgain: true, rawStatus: "unavailable" };
}

/**
 * Open the platform notification settings screen so the user can re-enable
 * notifications after deny/block.
 *
 * Android targets the exact app notification channel screen when possible
 * (APP_NOTIFICATION_SETTINGS), then app details, then generic Settings.
 */
export async function openNotificationSettings(androidPackageName?: string): Promise<void> {
  if (Platform.OS === "ios") {
    await Linking.openURL("app-settings:");
    return;
  }

  if (Platform.OS === "android") {
    const pkg =
      androidPackageName ||
      Constants.expoConfig?.android?.package ||
      (Constants.manifest as { android?: { package?: string } } | null)?.android?.package ||
      undefined;

    const IntentLauncher = await import("expo-intent-launcher");

    // 1) Exact notification settings for this package (Android 8+).
    if (pkg) {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
          {
            data: `package:${pkg}`,
            extra: {
              "android.provider.extra.APP_PACKAGE": pkg,
              app_package: pkg,
            },
          }
        );
        return;
      } catch {
        // try alternate extra shape / fallbacks below
      }

      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
          {
            extra: {
              "android.provider.extra.APP_PACKAGE": pkg,
            },
          }
        );
        return;
      } catch {
        // fall through
      }

      // 2) App details → user can open Notifications from there.
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
          { data: `package:${pkg}` }
        );
        return;
      } catch {
        // fall through
      }
    }
  }

  await Linking.openSettings();
}
