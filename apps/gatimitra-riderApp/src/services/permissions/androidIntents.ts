import { Platform, Linking, Alert } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";

/**
 * Android-specific permission deep linking
 * Opens exact permission pages instead of just app settings
 */

function getAndroidPackageName(): string {
  // Try to get from Constants
  const packageName = Constants.expoConfig?.android?.package || 
                      Constants.manifest?.android?.package ||
                      "com.gatimitra.riderapp"; // Fallback
  return packageName;
}

export async function openLocationPermissionSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    // iOS uses app-settings: which opens app settings
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open app-specific location permission page
    const packageName = getAndroidPackageName();
    // Try to open app permissions page (Android 6.0+)
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      {
        data: `package:${packageName}`,
      }
    );
  } catch (error) {
    console.warn("Failed to open location permission settings, falling back:", error);
    try {
      // Fallback: try general location settings
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS,
        {}
      );
    } catch (fallbackError) {
      // Final fallback: app settings
      await Linking.openSettings();
    }
  }
}

export async function openNotificationPermissionSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open app notification settings
    const packageName = getAndroidPackageName();
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
      {
        data: `package:${packageName}`,
      }
    );
  } catch (error) {
    console.warn("Failed to open notification settings, falling back to app settings:", error);
    await Linking.openSettings();
  }
}

export async function openCameraPermissionSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open app permissions page with camera highlighted
    const packageName = getAndroidPackageName();
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      {
        data: `package:${packageName}`,
      }
    );
  } catch (error) {
    console.warn("Failed to open camera settings, falling back to app settings:", error);
    await Linking.openSettings();
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open battery optimization settings for this app
    const packageName = getAndroidPackageName();
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      {
        data: `package:${packageName}`,
      }
    );
  } catch (error) {
    console.warn("Failed to open battery optimization settings:", error);
    // Fallback to app info
    await Linking.openSettings();
  }
}

export async function openBackgroundRunningSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open app info where user can enable background running
    const packageName = getAndroidPackageName();
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      {
        data: `package:${packageName}`,
      }
    );
  } catch (error) {
    console.warn("Failed to open background running settings:", error);
    await Linking.openSettings();
  }
}

export async function openLocationServicesSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open location services/GPS settings
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS,
      {}
    );
  } catch (error) {
    console.warn("Failed to open location services settings:", error);
    // Fallback to general settings
    await Linking.openSettings();
  }
}

export async function openDisplayOverOtherAppsSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    // Open app info where user can enable "Display over other apps"
    const packageName = getAndroidPackageName();
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      {
        data: `package:${packageName}`,
      }
    );
  } catch (error) {
    console.warn("Failed to open display over other apps settings:", error);
    await Linking.openSettings();
  }
}
