import { Platform } from "react-native";
import Constants from "expo-constants";
import { getItem, setItem } from "@/src/utils/storage";

/**
 * Android Permission Checker
 * 
 * Since Android doesn't provide easy APIs to check battery optimization,
 * background running, and display over apps status without native code,
 * we use a workaround approach:
 * 
 * 1. Store "assumed granted" state after user returns from settings
 * 2. Check with timestamp to allow re-checking if needed
 * 3. For permissions we CAN check (location, notifications), use actual APIs
 */

const PERMISSION_STATE_KEY = "android_permission_states";
const PERMISSION_CHECK_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

interface PermissionStateCache {
  [key: string]: {
    status: "granted" | "denied" | "undetermined";
    timestamp: number;
  };
}

/**
 * Get cached permission states
 */
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

/**
 * Save permission state to cache
 */
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

/**
 * Check if cached permission state is still valid
 */
function isCacheValid(
  cachedState: PermissionStateCache[string] | undefined
): boolean {
  if (!cachedState) return false;
  const age = Date.now() - cachedState.timestamp;
  return age < PERMISSION_CHECK_TIMEOUT;
}

/**
 * Android Permission Checker Class
 */
export class AndroidPermissionChecker {
  /**
   * Check battery optimization status
   * 
   * Since we can't check this programmatically without native code,
   * we use a cache-based approach:
   * - If user recently returned from battery optimization settings, assume granted
   * - Otherwise, return undetermined (will show permission step)
   */
  async checkBatteryOptimization(): Promise<{
    status: "granted" | "denied" | "undetermined";
    canAskAgain: boolean;
  }> {
    if (Platform.OS !== "android") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const cached = await getCachedPermissionStates();
      const cachedState = cached["battery_optimization"];

      if (isCacheValid(cachedState)) {
        return {
          status: cachedState.status,
          canAskAgain: cachedState.status !== "granted",
        };
      }

      // No valid cache - return undetermined (will show permission step)
      return { status: "undetermined", canAskAgain: true };
    } catch (error) {
      console.warn("Error checking battery optimization:", error);
      return { status: "undetermined", canAskAgain: true };
    }
  }

  /**
   * Mark battery optimization as granted (called after user returns from settings)
   */
  async markBatteryOptimizationGranted(): Promise<void> {
    await savePermissionState("battery_optimization", "granted");
  }

  /**
   * Check background running status
   * 
   * Similar to battery optimization - use cache-based approach
   */
  async checkBackgroundRunning(): Promise<{
    status: "granted" | "denied" | "undetermined";
    canAskAgain: boolean;
  }> {
    if (Platform.OS !== "android") {
      return { status: "granted", canAskAgain: false };
    }

    try {
      const cached = await getCachedPermissionStates();
      const cachedState = cached["background_running"];

      if (isCacheValid(cachedState)) {
        return {
          status: cachedState.status,
          canAskAgain: cachedState.status !== "granted",
        };
      }

      return { status: "undetermined", canAskAgain: true };
    } catch (error) {
      console.warn("Error checking background running:", error);
      return { status: "undetermined", canAskAgain: true };
    }
  }

  /**
   * Mark background running as granted
   */
  async markBackgroundRunningGranted(): Promise<void> {
    await savePermissionState("background_running", "granted");
  }

  /**
   * Check display over apps status
   * 
   * Similar to battery optimization - use cache-based approach
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

      if (isCacheValid(cachedState)) {
        return {
          status: cachedState.status,
          canAskAgain: cachedState.status !== "granted",
        };
      }

      return { status: "undetermined", canAskAgain: true };
    } catch (error) {
      console.warn("Error checking display over apps:", error);
      return { status: "undetermined", canAskAgain: true };
    }
  }

  /**
   * Mark display over apps as granted
   */
  async markDisplayOverAppsGranted(): Promise<void> {
    await savePermissionState("display_over_apps", "granted");
  }

  /**
   * Clear all cached permission states (useful for testing or reset)
   */
  async clearCache(): Promise<void> {
    try {
      await setItem(PERMISSION_STATE_KEY, JSON.stringify({}));
    } catch (error) {
      console.warn("Error clearing permission cache:", error);
    }
  }

  /**
   * Invalidate a specific permission cache (force re-check)
   */
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
