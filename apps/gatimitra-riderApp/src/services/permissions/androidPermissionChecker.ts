import { Platform } from "react-native";
import { getItem, setItem } from "@/src/utils/storage";
import {
  getBackgroundRunningStatus,
  getBatteryOptimizationStatus,
} from "./backgroundExecution";

/**
 * Android / iOS permission checker for settings-gated onboarding steps.
 *
 * Battery + Background Running use real OS APIs (expo-battery / location).
 * Display-over-apps still uses a short-lived cache only as a soft hint because
 * Expo has no Settings.canDrawOverlays() wrapper; Allow always opens the real
 * system screen and never auto-grants on undetermined.
 */

const PERMISSION_STATE_KEY = "android_permission_states";
/** Overlay cache TTL — short so revoked settings resurface quickly. */
const OVERLAY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface PermissionStateCache {
  [key: string]: {
    status: "granted" | "denied" | "undetermined";
    timestamp: number;
  };
}

async function getCachedPermissionStates(): Promise<PermissionStateCache> {
  try {
    const cached = await getItem(PERMISSION_STATE_KEY);
    if (cached) {
      return JSON.parse(cached) as PermissionStateCache;
    }
  } catch (error) {
    console.warn("Error reading cached permission states:", error);
  }
  return {};
}

async function savePermissionState(
  permissionKey: string,
  status: "granted" | "denied" | "undetermined"
): Promise<void> {
  try {
    const cached = await getCachedPermissionStates();
    cached[permissionKey] = {
      status,
      timestamp: Date.now(),
    };
    await setItem(PERMISSION_STATE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.warn("Error saving permission state:", error);
  }
}

function isCacheValid(
  cachedState: PermissionStateCache[string] | undefined,
  ttlMs: number
): boolean {
  if (!cachedState) return false;
  return Date.now() - cachedState.timestamp < ttlMs;
}

export class AndroidPermissionChecker {
  async checkBatteryOptimization(): Promise<{
    status: "granted" | "denied" | "undetermined";
    canAskAgain: boolean;
  }> {
    const live = await getBatteryOptimizationStatus();
    if (live.status === "granted") {
      await savePermissionState("battery_optimization", "granted");
    } else if (live.status === "denied") {
      await savePermissionState("battery_optimization", "denied");
    }
    return live;
  }

  async markBatteryOptimizationGranted(): Promise<void> {
    const live = await getBatteryOptimizationStatus();
    await savePermissionState(
      "battery_optimization",
      live.status === "granted" ? "granted" : "denied"
    );
  }

  async checkBackgroundRunning(): Promise<{
    status: "granted" | "denied" | "undetermined";
    canAskAgain: boolean;
  }> {
    const live = await getBackgroundRunningStatus();
    if (live.status === "granted") {
      await savePermissionState("background_running", "granted");
    } else if (live.status === "denied") {
      await savePermissionState("background_running", "denied");
    }
    return live;
  }

  async markBackgroundRunningGranted(): Promise<void> {
    const live = await getBackgroundRunningStatus();
    await savePermissionState(
      "background_running",
      live.status === "granted" ? "granted" : "denied"
    );
  }

  /**
   * Overlay permission cannot be read from JS without a native module.
   * Cache is only a soft hint after the user visited settings — never treat
   * undetermined as granted.
   */
  async checkDisplayOverApps(): Promise<{
    status: "granted" | "denied" | "undetermined";
    canAskAgain: boolean;
  }> {
    if (Platform.OS !== "android") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const cached = await getCachedPermissionStates();
      const cachedState = cached["display_over_apps"];

      if (isCacheValid(cachedState, OVERLAY_CACHE_TTL_MS) && cachedState.status === "granted") {
        return { status: "granted", canAskAgain: false };
      }

      return { status: "undetermined", canAskAgain: true };
    } catch (error) {
      console.warn("Error checking display over apps:", error);
      return { status: "undetermined", canAskAgain: true };
    }
  }

  async markDisplayOverAppsGranted(): Promise<void> {
    await savePermissionState("display_over_apps", "granted");
  }

  async clearCache(): Promise<void> {
    try {
      await setItem(PERMISSION_STATE_KEY, JSON.stringify({}));
    } catch (error) {
      console.warn("Error clearing permission cache:", error);
    }
  }

  async invalidateCache(permissionKey: string): Promise<void> {
    try {
      const cached = await getCachedPermissionStates();
      delete cached[permissionKey];
      await setItem(PERMISSION_STATE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.warn("Error invalidating permission cache:", error);
    }
  }
}

export const androidPermissionChecker = new AndroidPermissionChecker();
