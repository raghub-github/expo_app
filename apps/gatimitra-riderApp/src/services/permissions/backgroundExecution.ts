/**
 * Real OS checks for rider background-execution onboarding steps.
 *
 * Android: expo-battery PowerManager wrapper (optimization enabled?).
 * iOS: background location is the user-controlled background capability.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";

export type BackgroundExecutionStatus = {
  /** True when background execution is adequately configured. */
  enabled: boolean;
  /** Underlying signal used for debugging / UI. */
  reason:
    | "battery_unrestricted"
    | "battery_optimized"
    | "ios_background_location"
    | "ios_background_location_denied"
    | "expo_go_skipped"
    | "unavailable"
    | "error";
};

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/**
 * Android: battery optimization DISABLED (unrestricted / ignore list) means
 * background work is allowed. expo-battery returns true when optimization
 * is still ON (restricted).
 */
export async function readAndroidBatteryUnrestricted(): Promise<boolean | null> {
  if (Platform.OS !== "android") return null;
  try {
    const Battery = await import("expo-battery");
    if (typeof Battery.isBatteryOptimizationEnabledAsync !== "function") {
      return null;
    }
    const optimizationEnabled = await Battery.isBatteryOptimizationEnabledAsync();
    return !optimizationEnabled;
  } catch (e) {
    console.warn("[backgroundExecution] expo-battery check failed:", (e as Error)?.message);
    return null;
  }
}

/**
 * iOS has no per-app "background running" toggle like Android. For riders the
 * meaningful user-controlled capability is Always / background location.
 */
export async function readIosBackgroundCapability(): Promise<boolean> {
  if (Platform.OS !== "ios") return true;
  if (isExpoGo()) return true;
  try {
    const background = await Location.getBackgroundPermissionsAsync();
    return background.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Shared "Background Running" readiness used by onboarding + permission store.
 */
export async function getBackgroundExecutionStatus(): Promise<BackgroundExecutionStatus> {
  if (isExpoGo()) {
    // Host Expo Go owns process lifecycle — cannot configure rider package.
    return { enabled: true, reason: "expo_go_skipped" };
  }

  if (Platform.OS === "ios") {
    const ok = await readIosBackgroundCapability();
    return {
      enabled: ok,
      reason: ok ? "ios_background_location" : "ios_background_location_denied",
    };
  }

  if (Platform.OS === "android") {
    const unrestricted = await readAndroidBatteryUnrestricted();
    if (unrestricted == null) {
      return { enabled: false, reason: "unavailable" };
    }
    return {
      enabled: unrestricted,
      reason: unrestricted ? "battery_unrestricted" : "battery_optimized",
    };
  }

  return { enabled: true, reason: "unavailable" };
}

/**
 * Battery Optimization step status via expo-battery PowerManager wrapper.
 * - Android: granted only when optimization is DISABLED (app unrestricted / on ignore list).
 * - iOS / Expo Go: no per-app toggle → treated as granted (step is filtered out of iOS UI).
 */
export async function getBatteryOptimizationStatus(): Promise<{
  status: "granted" | "denied" | "undetermined";
  canAskAgain: boolean;
}> {
  if (Platform.OS !== "android") {
    return { status: "granted", canAskAgain: false };
  }
  if (isExpoGo()) {
    return { status: "granted", canAskAgain: false };
  }
  const unrestricted = await readAndroidBatteryUnrestricted();
  if (unrestricted == null) {
    return { status: "undetermined", canAskAgain: true };
  }
  return unrestricted
    ? { status: "granted", canAskAgain: false }
    : { status: "denied", canAskAgain: true };
}

export async function getBackgroundRunningStatus(): Promise<{
  status: "granted" | "denied" | "undetermined";
  canAskAgain: boolean;
}> {
  const snap = await getBackgroundExecutionStatus();
  if (snap.reason === "unavailable") {
    return { status: "undetermined", canAskAgain: true };
  }
  if (snap.enabled) {
    return { status: "granted", canAskAgain: false };
  }
  return { status: "denied", canAskAgain: true };
}
