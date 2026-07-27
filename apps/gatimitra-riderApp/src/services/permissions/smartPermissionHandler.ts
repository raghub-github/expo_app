import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { permissionManager } from "./permissionManager";
import {
  openLocationPermissionSettings,
  openBatteryOptimizationSettings,
  openBackgroundRunningSettings,
  openLocationServicesSettings,
  openDisplayOverOtherAppsSettings,
} from "./androidIntents";
import { getNotificationPermissions, openSharedNotificationSettings } from "./notificationsWrapper";
import { androidPermissionChecker } from "./androidPermissionChecker";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";

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
  requiresSettings: boolean;
}

export type LocationAllowPipelineResult = {
  enabled: boolean;
  reason?: "denied" | "gps_off" | "background_denied" | "fix_failed";
  fixAcquired: boolean;
  openedSettings?: boolean;
};

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export class SmartPermissionHandler {
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

  async handleAllow(stepKey: PermissionStepKey): Promise<boolean> {
    if (stepKey === "location") {
      const result = await this.runLocationAllowPipeline();
      return result.enabled && result.fixAcquired;
    }

    if (stepKey === "notifications") {
      return this.handleNotificationAllowAction();
    }

    if (stepKey === "battery_optimization") {
      return this.handleBatteryOptimizationAllowAction();
    }

    if (stepKey === "background_running") {
      return this.handleBackgroundSettingsAllowAction("background_running");
    }

    const check = await this.checkPermission(stepKey);

    if (check.status === "granted") {
      return true;
    }

    if (check.requiresSettings) {
      await this.openSettingsForStep(stepKey);
      return false;
    }

    if (check.canAskAgain) {
      try {
        await this.requestPermission(stepKey);
        const after = await this.checkPermission(stepKey);
        if (after.status === "granted") {
          return true;
        }
      } catch (error) {
        console.warn(`Error requesting ${stepKey}:`, error);
      }
    }

    await this.openSettingsForStep(stepKey);
    return false;
  }

  /**
   * Battery Optimization Allow:
   * 1) Read live PowerManager state (expo-battery)
   * 2) If already unrestricted → complete
   * 3) 1st Allow → ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
   * 4) Later Allows → OEM / ignore-list / app Battery settings
   * 5) Re-read OS; only return true when unrestricted
   */
  private batteryOptimizationGuideAttempt = 0;

  async handleBatteryOptimizationAllowAction(): Promise<boolean> {
    let check = await this.checkBatteryOptimization();
    if (check.status === "granted") {
      this.batteryOptimizationGuideAttempt = 0;
      await this.markPermissionGranted("battery_optimization");
      return true;
    }

    const mode = this.batteryOptimizationGuideAttempt === 0 ? "request" : "guide";
    this.batteryOptimizationGuideAttempt += 1;
    await openBatteryOptimizationSettings(mode);
    await new Promise((r) => setTimeout(r, 500));
    check = await this.checkBatteryOptimization();
    if (check.status === "granted") {
      this.batteryOptimizationGuideAttempt = 0;
      await this.markPermissionGranted("battery_optimization");
      return true;
    }
    return false;
  }

  /**
   * Background Running:
   * Always open the real system UI when not already granted; never fake success.
   * AppState return path re-reads OS state via checkPermission.
   */
  async handleBackgroundSettingsAllowAction(
    stepKey: "battery_optimization" | "background_running"
  ): Promise<boolean> {
    let check = await this.checkPermission(stepKey);
    if (check.status === "granted") {
      await this.markPermissionGranted(stepKey);
      return true;
    }

    await this.openSettingsForStep(stepKey);
    // Give the OS a beat after the intent returns (some OEMs grant sync).
    await new Promise((r) => setTimeout(r, 400));
    check = await this.checkPermission(stepKey);
    if (check.status === "granted") {
      await this.markPermissionGranted(stepKey);
      return true;
    }
    return false;
  }

  async handleNotificationAllowAction(): Promise<boolean> {
    let check = await this.checkNotificationPermission();
    if (check.status === "granted") {
      return true;
    }

    if (check.canAskAgain) {
      await this.requestPermission("notifications");
      check = await this.checkNotificationPermission();
      if (check.status === "granted") {
        return true;
      }
    }

    await openSharedNotificationSettings();
    return false;
  }

  /** @deprecated Prefer runLocationAllowPipeline which also acquires a live fix. */
  async handleLocationAllowAction(): Promise<void> {
    await this.runLocationAllowPipeline({ acquireFix: false });
  }

  /**
   * Full Location Access pipeline:
   * GPS → foreground permission → acquire+geocode → background (non-Expo Go).
   */
  async runLocationAllowPipeline(options?: {
    acquireFix?: boolean;
  }): Promise<LocationAllowPipelineResult> {
    const acquireFix = options?.acquireFix !== false;
    let openedSettings = false;

    let servicesEnabled = await permissionManager.checkLocationServicesEnabled();
    if (!servicesEnabled) {
      if (Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          // User dismissed system dialog.
        }
        servicesEnabled = await permissionManager.checkLocationServicesEnabled();
      }
      if (!servicesEnabled) {
        await openLocationServicesSettings();
        openedSettings = true;
        const readiness = await getDeviceLocationReadiness();
        useRiderLocationStore.getState().setReadiness({
          permissionStatus: readiness.permissionStatus,
          servicesEnabled: false,
          isReady: false,
        });
        return { enabled: false, reason: "gps_off", fixAcquired: false, openedSettings };
      }
    }

    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== "granted" && foreground.canAskAgain !== false) {
      await Location.requestForegroundPermissionsAsync();
    }
    const foregroundAfter = await Location.getForegroundPermissionsAsync();
    if (foregroundAfter.status !== "granted") {
      await openLocationPermissionSettings();
      openedSettings = true;
      useRiderLocationStore.getState().setReadiness({
        permissionStatus: "denied",
        servicesEnabled: true,
        isReady: false,
      });
      return { enabled: false, reason: "denied", fixAcquired: false, openedSettings };
    }

    useRiderLocationStore.getState().setReadiness({
      permissionStatus: "granted",
      servicesEnabled: true,
      isReady: true,
    });

    let fixAcquired = !!useRiderLocationStore.getState().coords;
    if (acquireFix) {
      // Always take a fresh device reading — never reuse a stale in-memory fix.
      useRiderLocationStore.getState().clearFix();
      const acquisition = await acquireAndCommitRiderLocation({
        assumeReady: true,
        requireFresh: true,
      });
      fixAcquired = acquisition.ok || !!useRiderLocationStore.getState().coords;
    }

    if (!isExpoGo()) {
      const background = await Location.getBackgroundPermissionsAsync();
      if (background.status !== "granted" && background.canAskAgain !== false) {
        await Location.requestBackgroundPermissionsAsync();
      }
      const backgroundAfter = await Location.getBackgroundPermissionsAsync();
      if (backgroundAfter.status !== "granted") {
        await openLocationPermissionSettings();
        openedSettings = true;
        return {
          enabled: false,
          reason: "background_denied",
          fixAcquired,
          openedSettings,
        };
      }
    }

    if (acquireFix && !fixAcquired) {
      return { enabled: false, reason: "fix_failed", fixAcquired: false, openedSettings };
    }

    return { enabled: true, fixAcquired, openedSettings };
  }

  private async requestPermission(
    stepKey: PermissionStepKey
  ): Promise<{ status: string; canAskAgain: boolean }> {
    switch (stepKey) {
      case "location":
        return await permissionManager.requestLocationPermissions();
      case "notifications":
        return await permissionManager.requestNotifications();
      default:
        throw new Error(`Cannot request ${stepKey} directly`);
    }
  }

  private async openSettingsForStep(stepKey: PermissionStepKey): Promise<void> {
    switch (stepKey) {
      case "location":
        await openLocationPermissionSettings();
        break;
      case "location_services":
        await openLocationServicesSettings();
        break;
      case "notifications":
        await openSharedNotificationSettings();
        break;
      case "battery_optimization":
        await openBatteryOptimizationSettings("guide");
        break;
      case "background_running":
        await openBackgroundRunningSettings();
        break;
      case "display_over_apps":
        await openDisplayOverOtherAppsSettings();
        break;
    }
  }

  private async checkLocationPermission(): Promise<PermissionCheckResult> {
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();

      if (
        foreground.status === "granted" &&
        (isExpoGo() || background?.status === "granted")
      ) {
        return { status: "granted", canAskAgain: false, requiresSettings: false };
      }

      const canAskAgain = foreground.canAskAgain ?? true;
      return {
        status: foreground.status === "granted" ? "denied" : foreground.status,
        canAskAgain,
        requiresSettings: !canAskAgain,
      };
    } catch {
      return { status: "undetermined", canAskAgain: true, requiresSettings: false };
    }
  }

  private async checkLocationServices(): Promise<PermissionCheckResult> {
    try {
      const enabled = await permissionManager.checkLocationServicesEnabled();
      return {
        status: enabled ? "granted" : "denied",
        canAskAgain: true,
        requiresSettings: true,
      };
    } catch {
      return { status: "undetermined", canAskAgain: true, requiresSettings: true };
    }
  }

  private async checkNotificationPermission(): Promise<PermissionCheckResult> {
    try {
      const result = await getNotificationPermissions();
      const osBlocked = (result as { osStatus?: string }).osStatus === "blocked";
      const canAskAgain = result.canAskAgain !== false && !osBlocked;
      return {
        status:
          result.status === "granted"
            ? "granted"
            : result.status === "denied"
              ? "denied"
              : "undetermined",
        canAskAgain,
        requiresSettings: result.status === "denied" || osBlocked,
      };
    } catch {
      return { status: "undetermined", canAskAgain: true, requiresSettings: false };
    }
  }

  private async checkBatteryOptimization(): Promise<PermissionCheckResult> {
    const result = await androidPermissionChecker.checkBatteryOptimization();
    return {
      status: result.status,
      canAskAgain: result.canAskAgain,
      requiresSettings: true,
    };
  }

  private async checkBackgroundRunning(): Promise<PermissionCheckResult> {
    const result = await androidPermissionChecker.checkBackgroundRunning();
    return {
      status: result.status,
      canAskAgain: result.canAskAgain,
      requiresSettings: true,
    };
  }

  private async checkDisplayOverApps(): Promise<PermissionCheckResult> {
    const result = await androidPermissionChecker.checkDisplayOverApps();
    return {
      status: result.status,
      canAskAgain: result.canAskAgain,
      requiresSettings: true,
    };
  }

  async markPermissionGranted(stepKey: PermissionStepKey): Promise<void> {
    switch (stepKey) {
      case "battery_optimization": {
        const live = await androidPermissionChecker.checkBatteryOptimization();
        if (live.status === "granted") {
          await androidPermissionChecker.markBatteryOptimizationGranted();
        }
        break;
      }
      case "background_running": {
        const live = await androidPermissionChecker.checkBackgroundRunning();
        if (live.status === "granted") {
          await androidPermissionChecker.markBackgroundRunningGranted();
        }
        break;
      }
      case "display_over_apps":
        // Soft mark only after user returned from overlay settings (caller verifies UX).
        await androidPermissionChecker.markDisplayOverAppsGranted();
        break;
      default:
        break;
    }
  }

  async markPermissionDenied(stepKey: PermissionStepKey): Promise<void> {
    switch (stepKey) {
      case "battery_optimization":
      case "background_running":
      case "display_over_apps":
        await androidPermissionChecker.invalidateCache(stepKey);
        break;
      default:
        break;
    }
  }

  async isLocationFullyEnabled(): Promise<{
    enabled: boolean;
    reason?: "denied" | "gps_off" | "background_denied";
  }> {
    try {
      const gpsEnabled = await permissionManager.checkLocationServicesEnabled();
      if (!gpsEnabled) {
        return { enabled: false, reason: "gps_off" };
      }

      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();

      if (foreground.status !== "granted") {
        return { enabled: false, reason: "denied" };
      }

      if (!isExpoGo() && background?.status !== "granted") {
        return { enabled: false, reason: "background_denied" };
      }

      return { enabled: true };
    } catch {
      return { enabled: false, reason: "denied" };
    }
  }
}

export const smartPermissionHandler = new SmartPermissionHandler();
