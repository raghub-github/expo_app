/**
 * Thin wrapper that delegates notification permission checks/requests to the
 * shared `@gatimitra/expo-push-kit` controller helpers (single source of truth).
 */

import { Platform } from "react-native";
import {
  readNotificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
} from "@gatimitra/expo-push-kit";
import Constants from "expo-constants";

function androidPackage(): string | undefined {
  // Expo Go host owns notification permission toggles — open that package's settings.
  if (Constants.appOwnership === "expo") {
    return "host.exp.exponent";
  }
  return (
    Constants.expoConfig?.android?.package ||
    (Constants.manifest as { android?: { package?: string } } | null)?.android?.package ||
    "com.gatimitra.rider"
  );
}

export async function requestNotificationPermissions() {
  try {
    const result = await requestNotificationPermission();
    return {
      status: (result.osStatus === "granted"
        ? "granted"
        : result.osStatus === "undetermined"
          ? "undetermined"
          : "denied") as "granted" | "denied" | "undetermined",
      canAskAgain: result.canAskAgain,
    };
  } catch (error) {
    console.warn("requestNotificationPermissions failed:", error);
    return {
      status: "denied" as const,
      canAskAgain: false,
    };
  }
}

export async function getNotificationPermissions() {
  try {
    const result = await readNotificationPermission();
    return {
      status: (result.osStatus === "granted"
        ? "granted"
        : result.osStatus === "undetermined"
          ? "undetermined"
          : "denied") as "granted" | "denied" | "undetermined",
      canAskAgain: result.canAskAgain,
      osStatus: result.osStatus,
    };
  } catch (error) {
    console.warn("getNotificationPermissions failed:", error);
    return {
      status: "undetermined" as const,
      canAskAgain: true,
      osStatus: "undetermined" as const,
    };
  }
}

export async function openSharedNotificationSettings(): Promise<void> {
  // Prefer rider androidIntents (Expo Go package-aware) when available.
  if (Platform.OS === "android") {
    try {
      const { openNotificationPermissionSettings } = await import("./androidIntents");
      await openNotificationPermissionSettings();
      return;
    } catch (error) {
      console.warn("androidIntents notification settings failed, using push-kit:", error);
    }
  }
  await openNotificationSettings(androidPackage());
}
