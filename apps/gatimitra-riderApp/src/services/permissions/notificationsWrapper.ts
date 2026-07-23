/**
 * Thin wrapper that delegates notification permission checks/requests to the
 * shared `@gatimitra/expo-push-kit` controller helpers (single source of truth).
 */

import {
  readNotificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
} from "@gatimitra/expo-push-kit";
import Constants from "expo-constants";

function androidPackage(): string | undefined {
  return (
    Constants.expoConfig?.android?.package ||
    (Constants.manifest as { android?: { package?: string } } | null)?.android?.package ||
    "com.raghubhunia.gatimitrariderapp"
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
  await openNotificationSettings(androidPackage());
}
