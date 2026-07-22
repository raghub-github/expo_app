import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import type { PushOsPermissionStatus } from "./types";

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === "expo";
}

/** Permission APIs work in Expo Go; remote token APIs do not. */
export async function loadNotificationsModule(
  opts?: { allowExpoGo?: boolean }
): Promise<typeof import("expo-notifications") | null> {
  try {
    if (!opts?.allowExpoGo && isExpoGoRuntime()) {
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

    try {
      const IntentLauncher = await import("expo-intent-launcher");
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
        pkg
          ? {
              // Some Android versions want extra.packageName; IntentLauncher
              // also accepts `data: package:...` via APPLICATION_DETAILS.
              extra: { "android.provider.extra.APP_PACKAGE": pkg },
            }
          : {}
      );
      return;
    } catch {
      // fall through
    }

    if (pkg) {
      try {
        const IntentLauncher = await import("expo-intent-launcher");
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
