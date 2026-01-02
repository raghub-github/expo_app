import * as Location from "expo-location";
import { Platform, Linking, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  openLocationPermissionSettings,
  openNotificationPermissionSettings,
  openCameraPermissionSettings,
  openBatteryOptimizationSettings,
  openBackgroundRunningSettings,
} from "./androidIntents";

export type PermissionType =
  | "location_foreground"
  | "location_background"
  | "notifications"
  | "camera"
  | "media_library"
  | "background_running"
  | "sms" // Android only
  | "phone"; // Android only

export type PermissionStatus = "granted" | "denied" | "blocked" | "undetermined";

export interface PermissionState {
  location_foreground: PermissionStatus;
  location_background: PermissionStatus;
  notifications: PermissionStatus;
  camera: PermissionStatus;
  media_library: PermissionStatus;
  background_running: PermissionStatus;
  sms: PermissionStatus;
  phone: PermissionStatus;
}

export interface PermissionResult {
  status: PermissionStatus;
  canAskAgain: boolean;
}

/**
 * Centralized permission manager for the Rider app.
 * Handles all permission requests with proper error handling and user guidance.
 */
class PermissionManager {
  /**
   * Request foreground location permission (mandatory)
   */
  async requestLocationForeground(): Promise<PermissionResult> {
    try {
      // On web, location permissions work differently
      if (Platform.OS === "web") {
        // Web browsers handle location via geolocation API
        // Return granted if navigator.geolocation is available
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          return { status: "granted", canAskAgain: true };
        }
        return { status: "denied", canAskAgain: false };
      }
      
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      return {
        status: this.normalizeStatus(status),
        canAskAgain: canAskAgain ?? true,
      };
    } catch (error) {
      console.warn("Error requesting foreground location (non-critical):", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Request background location permission (required for active duty)
   * This requests both foreground and background permissions in sequence
   */
  async requestLocationBackground(): Promise<PermissionResult> {
    try {
      // First ensure foreground is granted
      const foreground = await this.requestLocationForeground();
      if (foreground.status !== "granted") {
        return { status: "denied", canAskAgain: foreground.canAskAgain };
      }

      // Check if location services are enabled (GPS)
      const servicesEnabled = await this.checkLocationServicesEnabled();
      if (!servicesEnabled) {
        // Location permission granted but GPS not enabled
        return { status: "denied", canAskAgain: true };
      }

      // Request background location permission
      const { status, canAskAgain } = await Location.requestBackgroundPermissionsAsync();
      return {
        status: this.normalizeStatus(status),
        canAskAgain: canAskAgain ?? true,
      };
    } catch (error) {
      console.error("Error requesting background location:", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Request location permissions (foreground + background) in sequence
   * This is the main method for the permission flow
   */
  async requestLocationPermissions(): Promise<PermissionResult> {
    try {
      // Step 1: Request foreground location
      const foreground = await this.requestLocationForeground();
      if (foreground.status !== "granted") {
        return foreground;
      }

      // Step 2: Check if location services (GPS) are enabled
      const servicesEnabled = await this.checkLocationServicesEnabled();
      if (!servicesEnabled) {
        // Permission granted but GPS not enabled - user needs to enable GPS
        return { status: "denied", canAskAgain: true };
      }

      // Step 3: Request background location
      const background = await this.requestLocationBackground();
      return background;
    } catch (error) {
      console.error("Error requesting location permissions:", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Request notification permission
   */
  async requestNotifications(): Promise<PermissionResult> {
    try {
      // Use wrapper to handle Expo Go limitations gracefully
      const { requestNotificationPermissions } = await import("./notificationsWrapper");
      const result = await requestNotificationPermissions();
      return {
        status: this.normalizeStatus(result.status),
        canAskAgain: result.canAskAgain,
      };
    } catch (error) {
      console.warn("Error requesting notifications (non-critical):", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Request camera permission (for KYC document scanning)
   */
  async requestCamera(): Promise<PermissionResult> {
    try {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      return {
        status: this.normalizeStatus(status),
        canAskAgain: canAskAgain ?? true,
      };
    } catch (error) {
      console.error("Error requesting camera:", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Request media library permission (for KYC document uploads)
   */
  async requestMediaLibrary(): Promise<PermissionResult> {
    try {
      // Use wrapper to handle errors gracefully
      const { requestMediaLibraryPermissions } = await import("./mediaLibraryWrapper");
      const result = await requestMediaLibraryPermissions();
      return {
        status: this.normalizeStatus(result.status),
        canAskAgain: result.canAskAgain,
      };
    } catch (error) {
      console.warn("Error requesting media library (non-critical):", error);
      // Return denied instead of throwing - don't block the app
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Request background running permission (Android)
   */
  async requestBackgroundRunning(): Promise<PermissionResult> {
    try {
      if (Platform.OS === "web" || Platform.OS === "ios") {
        // iOS handles this automatically, web doesn't need it
        return { status: "granted", canAskAgain: false };
      }

      // On Android, this is typically handled via battery optimization
      // We'll check if battery optimization is disabled
      // For now, return granted as this is more of a system setting
      return { status: "granted", canAskAgain: false };
    } catch (error) {
      console.warn("Error requesting background running (non-critical):", error);
      return { status: "denied", canAskAgain: false };
    }
  }

  /**
   * Check if location services are enabled (GPS)
   */
  async checkLocationServicesEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error("Error checking location services:", error);
      return false;
    }
  }

  /**
   * Get current permission states
   */
  async getPermissionStates(): Promise<PermissionState> {
    // Get notification permissions using wrapper
    let notificationsStatus = "undetermined" as PermissionStatus;
    try {
      const { getNotificationPermissions } = await import("./notificationsWrapper");
      const result = await getNotificationPermissions();
      notificationsStatus = this.normalizeStatus(result.status);
    } catch (error) {
      // Silently fail - notifications not available in Expo Go
      console.warn("Could not check notification permissions (non-critical):", error);
    }

    // Get location and camera permissions (always available)
    let locationForeground, locationBackground, camera;
    try {
      [locationForeground, locationBackground, camera] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        ImagePicker.getCameraPermissionsAsync(),
      ]);
    } catch (error) {
      console.warn("Error getting location/camera permissions:", error);
      // Set defaults if error
      locationForeground = { status: "undetermined" };
      locationBackground = { status: "undetermined" };
      camera = { status: "undetermined" };
    }

    // Get media library permission using wrapper
    let mediaLibraryStatus = "undetermined" as PermissionStatus;
    try {
      const { getMediaLibraryPermissions } = await import("./mediaLibraryWrapper");
      const result = await getMediaLibraryPermissions();
      mediaLibraryStatus = this.normalizeStatus(result.status);
    } catch (error) {
      // Silently fail - media library not available in Expo Go
      console.warn("Could not check media library permissions (non-critical):", error);
    }

    return {
      location_foreground: this.normalizeStatus(locationForeground.status),
      location_background: this.normalizeStatus(locationBackground?.status ?? "undetermined"),
      notifications: notificationsStatus,
      camera: this.normalizeStatus(camera.status),
      media_library: mediaLibraryStatus,
      background_running: "granted", // System-level, assume granted
      sms: "undetermined", // Android only, handled separately if needed
      phone: "undetermined", // Android only, handled separately if needed
    };
  }

  /**
   * Check if location is granted (mandatory check)
   */
  async isLocationGranted(): Promise<boolean> {
    try {
      // On web, check if geolocation is available
      if (Platform.OS === "web") {
        return typeof navigator !== "undefined" && !!navigator.geolocation;
      }
      
      const { status } = await Location.getForegroundPermissionsAsync();
      const enabled = await this.checkLocationServicesEnabled();
      return status === "granted" && enabled;
    } catch {
      return false;
    }
  }

  /**
   * Open app settings or specific permission page
   */
  async openSettings(permissionType?: PermissionType): Promise<void> {
    try {
      // Open specific permission page if type provided
      if (permissionType) {
        switch (permissionType) {
          case "location_foreground":
          case "location_background":
            await openLocationPermissionSettings();
            return;
          case "notifications":
            await openNotificationPermissionSettings();
            return;
          case "camera":
            await openCameraPermissionSettings();
            return;
          case "background_running":
            await openBackgroundRunningSettings();
            return;
          default:
            // Fall through to general settings
            break;
        }
      }

      // Default: open general app settings
      if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error("Error opening settings:", error);
      Alert.alert("Error", "Unable to open settings. Please open manually from your device settings.");
    }
  }

  /**
   * Normalize permission status to our type
   */
  private normalizeStatus(status: string): PermissionStatus {
    switch (status) {
      case "granted":
        return "granted";
      case "denied":
        return "denied";
      case "blocked":
        return "blocked";
      default:
        return "undetermined";
    }
  }
}

// Singleton instance
export const permissionManager = new PermissionManager();
