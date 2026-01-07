import { Platform } from "react-native";
import * as Location from "expo-location";
import { permissionManager } from "./permissionManager";
import {
  openLocationPermissionSettings,
  openNotificationPermissionSettings,
  openBatteryOptimizationSettings,
  openBackgroundRunningSettings,
  openLocationServicesSettings,
  openDisplayOverOtherAppsSettings,
} from "./androidIntents";
import { getNotificationPermissions } from "./notificationsWrapper";
import { androidPermissionChecker } from "./androidPermissionChecker";

export type PermissionStepKey =
  | "location"
  | "location_services"
  | "notifications"
  | "battery_optimization"
  | "background_running"
  | "display_over_apps";

export interface PermissionCheckResult {
  status: "granted" | "denied" | "undetermined";
  canAskAgain: boolean;
  requiresSettings: boolean; // If true, must open settings (can't request directly)
}

/**
 * Smart Permission Handler
 * 
 * This handler decides whether to:
 * 1. Request permission directly (shows native prompt)
 * 2. Open settings (permission already requested or requires manual enable)
 * 
 * The button ALWAYS says "Allow" - this logic happens behind it.
 */
export class SmartPermissionHandler {
  /**
   * Check current permission status
   */
  async checkPermission(stepKey: PermissionStepKey): Promise<PermissionCheckResult> {
    switch (stepKey) {
      case "location":
        return this.checkLocationPermission();
      case "location_services":
        return this.checkLocationServices();
      case "notifications":
        return this.checkNotificationPermission();
      case "battery_optimization":
        return this.checkBatteryOptimization();
      case "background_running":
        return this.checkBackgroundRunning();
      case "display_over_apps":
        return this.checkDisplayOverApps();
      default:
        return { status: "undetermined", canAskAgain: true, requiresSettings: false };
    }
  }

  /**
   * Handle "Allow" button press
   * 
   * This is the core logic - decides request vs settings redirect
   */
  async handleAllow(stepKey: PermissionStepKey): Promise<void> {
    const check = await this.checkPermission(stepKey);

    // If already granted, still open settings for configuration
    if (check.status === "granted") {
      await this.openSettingsForStep(stepKey);
      return;
    }

    // If requires settings (can't request directly), open settings
    if (check.requiresSettings) {
      await this.openSettingsForStep(stepKey);
      return;
    }

    // If can ask again, try to request directly first
    if (check.canAskAgain) {
      try {
        const result = await this.requestPermission(stepKey);
        
        // After requesting, always open settings for configuration
        // This ensures user can set "Allow all the time" for location
        // and enable sound/vibration for notifications
        await this.openSettingsForStep(stepKey);
      } catch (error) {
        console.warn(`Error requesting ${stepKey}:`, error);
        // On error, still try to open settings
        await this.openSettingsForStep(stepKey);
      }
    } else {
      // Can't ask again - must open settings
      await this.openSettingsForStep(stepKey);
    }
  }

  /**
   * Request permission directly (shows native prompt)
   */
  private async requestPermission(stepKey: PermissionStepKey): Promise<{ status: string; canAskAgain: boolean }> {
    switch (stepKey) {
      case "location":
        return await permissionManager.requestLocationPermissions();
      case "notifications":
        return await permissionManager.requestNotifications();
      default:
        throw new Error(`Cannot request ${stepKey} directly`);
    }
  }

  /**
   * Open settings for specific permission step
   */
  private async openSettingsForStep(stepKey: PermissionStepKey): Promise<void> {
    switch (stepKey) {
      case "location":
        await openLocationPermissionSettings();
        break;
      case "location_services":
        await openLocationServicesSettings();
        break;
      case "notifications":
        await openNotificationPermissionSettings();
        break;
      case "battery_optimization":
        await openBatteryOptimizationSettings();
        break;
      case "background_running":
        await openBackgroundRunningSettings();
        break;
      case "display_over_apps":
        await openDisplayOverOtherAppsSettings();
        break;
    }
  }

  /**
   * Check location permission status
   */
  private async checkLocationPermission(): Promise<PermissionCheckResult> {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();

      // Both must be granted
      if (foreground.status === "granted" && background?.status === "granted") {
        return { status: "granted", canAskAgain: false, requiresSettings: false };
      }

      // Check if we can ask again
      const canAskAgain = foreground.canAskAgain ?? true;

      return {
        status: foreground.status === "granted" ? "denied" : foreground.status,
        canAskAgain,
        requiresSettings: !canAskAgain, // If can't ask again, must use settings
      };
    } catch (error) {
      return { status: "undetermined", canAskAgain: true, requiresSettings: false };
    }
  }

  /**
   * Check location services (GPS) status
   */
  private async checkLocationServices(): Promise<PermissionCheckResult> {
    try {
      const enabled = await permissionManager.checkLocationServicesEnabled();
      return {
        status: enabled ? "granted" : "denied",
        canAskAgain: true,
        requiresSettings: true, // GPS must be enabled manually in settings
      };
    } catch (error) {
      return { status: "undetermined", canAskAgain: true, requiresSettings: true };
    }
  }

  /**
   * Check notification permission status
   */
  private async checkNotificationPermission(): Promise<PermissionCheckResult> {
    try {
      const result = await getNotificationPermissions();
      return {
        status: result.status === "granted" ? "granted" : result.status === "denied" ? "denied" : "undetermined",
        canAskAgain: result.status !== "denied",
        requiresSettings: result.status === "denied", // If denied, must use settings
      };
    } catch (error) {
      return { status: "undetermined", canAskAgain: true, requiresSettings: false };
    }
  }

  /**
   * Check battery optimization status
   */
  private async checkBatteryOptimization(): Promise<PermissionCheckResult> {
    const result = await androidPermissionChecker.checkBatteryOptimization();
    return {
      status: result.status,
      canAskAgain: result.canAskAgain,
      requiresSettings: true, // Always requires settings (no direct request API)
    };
  }

  /**
   * Check background running status
   */
  private async checkBackgroundRunning(): Promise<PermissionCheckResult> {
    const result = await androidPermissionChecker.checkBackgroundRunning();
    return {
      status: result.status,
      canAskAgain: result.canAskAgain,
      requiresSettings: true, // Always requires settings (no direct request API)
    };
  }

  /**
   * Check display over apps status
   */
  private async checkDisplayOverApps(): Promise<PermissionCheckResult> {
    const result = await androidPermissionChecker.checkDisplayOverApps();
    return {
      status: result.status,
      canAskAgain: result.canAskAgain,
      requiresSettings: true, // Always requires settings (no direct request API)
    };
  }

  /**
   * Mark permission as granted (called after user returns from settings)
   */
  async markPermissionGranted(stepKey: PermissionStepKey): Promise<void> {
    switch (stepKey) {
      case "battery_optimization":
        await androidPermissionChecker.markBatteryOptimizationGranted();
        break;
      case "background_running":
        await androidPermissionChecker.markBackgroundRunningGranted();
        break;
      case "display_over_apps":
        await androidPermissionChecker.markDisplayOverAppsGranted();
        break;
      // Location and notifications are checked via actual APIs, no need to cache
      default:
        break;
    }
  }

  /**
   * Mark permission as denied (called when user explicitly denies)
   * This invalidates the cache so we ask again next time
   */
  async markPermissionDenied(stepKey: PermissionStepKey): Promise<void> {
    switch (stepKey) {
      case "battery_optimization":
      case "background_running":
      case "display_over_apps":
        // Invalidate cache so we check again next time
        await androidPermissionChecker.invalidateCache(stepKey);
        break;
      // Location and notifications are checked via actual APIs, no need to cache
      default:
        break;
    }
  }

  /**
   * Check if location is fully enabled (permission + GPS)
   */
  async isLocationFullyEnabled(): Promise<{
    enabled: boolean;
    reason?: "denied" | "gps_off" | "background_denied";
  }> {
    try {
      // Check GPS
      const gpsEnabled = await permissionManager.checkLocationServicesEnabled();
      if (!gpsEnabled) {
        return { enabled: false, reason: "gps_off" };
      }

      // Check permissions
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();

      if (foreground.status !== "granted") {
        return { enabled: false, reason: "denied" };
      }

      if (background?.status !== "granted") {
        return { enabled: false, reason: "background_denied" };
      }

      return { enabled: true };
    } catch (error) {
      return { enabled: false, reason: "denied" };
    }
  }
}

export const smartPermissionHandler = new SmartPermissionHandler();
