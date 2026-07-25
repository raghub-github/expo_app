// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { Platform, Linking } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";

function getAndroidPackageName(): string {
  // In Expo Go the host app owns runtime permissions — not the project package from app.config.
  if (Constants.appOwnership === "expo") {
    return "host.exp.exponent";
  }

  return (
    Constants.expoConfig?.android?.package ||
    Constants.manifest?.android?.package ||
    "com.gatimitra.rider"
  );
}

async function openAndroidAppDetails(): Promise<void> {
  const packageName = getAndroidPackageName();
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
    { data: `package:${packageName}` }
  );
}

export async function openLocationPermissionSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    await openAndroidAppDetails();
  } catch (error) {
    console.warn("Failed to open location permission settings, falling back:", error);
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS,
        {}
      );
    } catch {
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
    const packageName = getAndroidPackageName();
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
      {
        data: `package:${packageName}`,
        extra: {
          "android.provider.extra.APP_PACKAGE": packageName,
        },
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
    await openAndroidAppDetails();
  } catch (error) {
    console.warn("Failed to open camera settings, falling back to app settings:", error);
    await Linking.openSettings();
  }
}

async function tryStartAndroidActivity(
  action: string,
  options?: { data?: string; extra?: Record<string, string> }
): Promise<boolean> {
  try {
    await IntentLauncher.startActivityAsync(action as never, options ?? {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the real battery-optimization flow.
 * @param mode `request` — system ignore-battery dialog first (Allow tap #1).
 *          `guide` — ignore-list / OEM / app details when still optimized (Allow tap #2+).
 * Completion is never assumed — callers must re-read OS state.
 */
export async function openBatteryOptimizationSettings(
  mode: "request" | "guide" = "request"
): Promise<void> {
  if (Platform.OS !== "android") {
    // iOS has no per-app battery-optimization toggle — open app Settings for guidance.
    await Linking.openURL("app-settings:");
    return;
  }

  const packageName = getAndroidPackageName();

  if (mode === "request") {
    // Official system permission dialog (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).
    const opened = await tryStartAndroidActivity(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${packageName}` }
    );
    if (opened) return;
    // Dialog unavailable — fall through to guide screens.
  }

  // System list of apps exempt from battery optimization.
  if (
    await tryStartAndroidActivity(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
    )
  ) {
    return;
  }

  // OEM battery / power-manager screens (MIUI, ColorOS, OneUI, Vivo, Realme, Huawei…).
  // Open the first resolvable screen only — do not cascade.
  const oemBatteryAttempts: Array<{ action: string; extras?: Record<string, string> }> = [
    { action: "miui.intent.action.POWER_HIDE_MODE_APP_LIST" },
    { action: "miui.intent.action.HIDDEN_APPLIST" },
    { action: "huawei.intent.action.HSM_PROTECTED_APPS" },
    { action: "huawei.intent.action.POWER_MANAGER" },
    { action: "com.coloros.safecenter" },
    { action: "com.oppo.safe" },
    { action: "com.realme.security.ACTION_POWER_MANAGER" },
    { action: "com.iqoo.powersaving" },
    { action: "com.vivo.permissionmanager" },
    { action: "com.samsung.android.sm.ACTION_BATTERY" },
    { action: "com.samsung.android.lool" },
    { action: "com.oneplus.security.action.BACKGROUND_APPS" },
  ];

  for (const attempt of oemBatteryAttempts) {
    if (
      await tryStartAndroidActivity(attempt.action, {
        extra: attempt.extras,
      })
    ) {
      return;
    }
  }

  // App info → Battery (user picks Unrestricted).
  try {
    await openAndroidAppDetails();
  } catch {
    await Linking.openSettings();
  }
}

/**
 * Background Running: prefer OEM autostart / background-activity screens.
 * Battery-ignore dialog is owned by the Battery Optimization step.
 */
export async function openBackgroundRunningSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  const packageName = getAndroidPackageName();

  // 1) OEM autostart / background activity screens (best-effort).
  const oemAttempts: Array<{ action: string; extras?: Record<string, string> }> = [
    // Xiaomi / MIUI
    { action: "miui.intent.action.OP_AUTO_START", extras: { packageName } },
    { action: "miui.intent.action.POWER_HIDE_MODE_APP_LIST" },
    // Huawei
    { action: "huawei.intent.action.HSM_BOOTAPP_MANAGER" },
    // Oppo / ColorOS / Realme
    { action: "oppo.intent.action.OPPO_COMPONENT_SAFE" },
    { action: "com.coloros.safecenter.permission.startup" },
    // Vivo
    { action: "com.iqoo.secure" },
    { action: "com.vivo.permissionmanager" },
    // Samsung
    { action: "com.samsung.android.sm.ACTION_BATTERY" },
    // OnePlus
    { action: "com.oneplus.security.action.BACKGROUND_APPS" },
  ];

  for (const attempt of oemAttempts) {
    try {
      await IntentLauncher.startActivityAsync(attempt.action as never, {
        extra: attempt.extras,
      });
      return;
    } catch {
      // try next OEM intent
    }
  }

  // 2) Background data restrictions for this package.
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BACKGROUND_DATA_RESTRICTIONS_SETTINGS,
      { data: `package:${packageName}` }
    );
    return;
  } catch {
    // continue
  }

  // 3) App details (Battery → Unrestricted / Background activity).
  try {
    await openAndroidAppDetails();
    return;
  } catch (error) {
    console.warn("Failed to open background running settings:", error);
  }

  // 4) Last resort: battery-optimization list (shared Android signal).
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
      {}
    );
    return;
  } catch {
    await Linking.openSettings();
  }
}

export async function openLocationServicesSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS,
      {}
    );
  } catch (error) {
    console.warn("Failed to open location services settings:", error);
    await Linking.openSettings();
  }
}

export async function openDisplayOverOtherAppsSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  const packageName = getAndroidPackageName();
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION,
      { data: `package:${packageName}` }
    );
    return;
  } catch (error) {
    console.warn("MANAGE_OVERLAY_PERMISSION failed:", error);
  }

  try {
    await openAndroidAppDetails();
  } catch {
    await Linking.openSettings();
  }
}
