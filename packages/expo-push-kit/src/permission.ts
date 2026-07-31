import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
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

export async function readNotificationPermission(): Promise<NotificationPermissionSnapshot> {
  const Notifications = await loadNotificationsModule({ allowExpoGo: true });
  if (!Notifications) {
    return { osStatus: "undetermined", canAskAgain: true, rawStatus: "unavailable" };
  }
  const result = await Notifications.getPermissionsAsync();
  const canAskAgain = result.canAskAgain !== false;
  return {
    osStatus: mapOsStatus(result.status, result.canAskAgain),
    canAskAgain,
    rawStatus: result.status,
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermissionSnapshot> {
  const Notifications = await loadNotificationsModule({ allowExpoGo: true });
  if (!Notifications) {
    return { osStatus: "undetermined", canAskAgain: true, rawStatus: "unavailable" };
  }
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
