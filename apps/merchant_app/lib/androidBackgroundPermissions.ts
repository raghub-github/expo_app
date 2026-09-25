/**
 * Android intents for merchant background wake (battery + display-over-apps).
 */
import { PermissionsAndroid, Platform, Linking } from "react-native";
import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";

function getAndroidPackageName(): string {
  if (Constants.appOwnership === "expo") {
    return "host.exp.exponent";
  }
  return (
    Constants.expoConfig?.android?.package ||
    (Constants.manifest as { android?: { package?: string } } | null)?.android?.package ||
    "com.gatimitra.partner"
  );
}

const ACTION_REQUEST_IGNORE_BATTERY = "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS";
const ACTION_IGNORE_BATTERY_LIST = "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS";
const ACTION_APP_DETAILS = "android.settings.APPLICATION_DETAILS_SETTINGS";
const ACTION_MANAGE_OVERLAY = "android.settings.action.MANAGE_OVERLAY_PERMISSION";

function intentAction(mod: { ActivityAction?: Record<string, string> } | null, key: string, fallback: string): string {
  const value = mod?.ActivityAction?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function openAndroidAppDetails(): Promise<void> {
  await IntentLauncher.startActivityAsync(
    intentAction(IntentLauncher, "APPLICATION_DETAILS_SETTINGS", ACTION_APP_DETAILS) as never,
    { data: `package:${getAndroidPackageName()}` }
  );
}

async function tryStart(action: string, options?: { data?: string }): Promise<boolean> {
  try {
    const started = Date.now();
    await IntentLauncher.startActivityAsync(action as never, options ?? {});
    // A system dialog the user actually sees does not return in a few milliseconds.
    return Date.now() - started > 400;
  } catch (error) {
    if (__DEV__) console.warn("[permissions] intent failed", action, error);
    return false;
  }
}

/** Open system “Ignore battery optimizations” / OEM unrestricted battery screens. */
export async function openMerchantBatteryOptimizationSettings(
  mode: "request" | "guide" = "request"
): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  const packageName = getAndroidPackageName();

  try {
    if (mode === "request") {
      await tryStart(intentAction(IntentLauncher, "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", ACTION_REQUEST_IGNORE_BATTERY), {
        data: `package:${packageName}`,
      });
      return;
    }

    if (await tryStart(intentAction(IntentLauncher, "IGNORE_BATTERY_OPTIMIZATION_SETTINGS", ACTION_IGNORE_BATTERY_LIST))) {
      return;
    }

    await openAndroidAppDetails();
  } catch (error) {
    if (__DEV__) console.warn("[permissions] battery settings failed", error);
    try {
      await Linking.openSettings();
    } catch {
      /* leave the user in the app */
    }
  }
}

/** Open Android app notification settings (Allow notifications master toggle). */
export async function openMerchantNotificationSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  const packageName = getAndroidPackageName();
  try {
    await IntentLauncher.startActivityAsync(
      intentAction(IntentLauncher, "APP_NOTIFICATION_SETTINGS", "android.settings.APP_NOTIFICATION_SETTINGS") as never,
      {
        extra: { "android.provider.extra.APP_PACKAGE": packageName },
      }
    );
    return;
  } catch {
    /* fall through */
  }

  try {
    await openAndroidAppDetails();
  } catch {
    await Linking.openSettings();
  }
}

export async function openMerchantDisplayOverAppsSettings(): Promise<void> {
  if (Platform.OS !== "android") {
    await Linking.openURL("app-settings:");
    return;
  }

  const packageName = getAndroidPackageName();
  try {
    await IntentLauncher.startActivityAsync(
      intentAction(IntentLauncher, "MANAGE_OVERLAY_PERMISSION", ACTION_MANAGE_OVERLAY) as never,
      { data: `package:${packageName}` }
    );
    return;
  } catch {
    /* fall through */
  }

  try {
    await openAndroidAppDetails();
  } catch {
    await Linking.openSettings();
  }
}

/** True only when Android's Settings.canDrawOverlays says this process may draw over other apps. */
export async function readMerchantOverlayAllowed(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const { canDrawNativeOverlays } = await import("@gatimitra/expo-push-kit");
    const native = await canDrawNativeOverlays();
    if (native === true || native === false) return native;
  } catch {
    /* Expo Go has no overlay module */
  }
  try {
    const { NativeModules } = await import("react-native");
    const alert = NativeModules.GatimitraOrderAlert as
      | { canDrawOverlays?: () => Promise<boolean> }
      | undefined;
    if (typeof alert?.canDrawOverlays === "function") {
      return (await alert.canDrawOverlays()) === true;
    }
  } catch {
    /* module missing */
  }
  try {
    return await PermissionsAndroid.check("android.permission.SYSTEM_ALERT_WINDOW" as never);
  } catch {
    return false;
  }
}

/** True when battery optimization is OFF (unrestricted) for this app. */
export async function readMerchantBatteryUnrestricted(): Promise<boolean | null> {
  if (Platform.OS !== "android") return true;
  try {
    const Battery = await import("expo-battery");
    if (typeof Battery.isBatteryOptimizationEnabledAsync !== "function") return null;
    const optimized = await Battery.isBatteryOptimizationEnabledAsync();
    return !optimized;
  } catch {
    return null;
  }
}

/**
 * Bring merchant app to foreground for accept (best-effort).
 * Works reliably when the process is alive / OEM allows background starts after FCM.
 */
export async function wakeMerchantAppForOrder(path: string): Promise<void> {
  if (Platform.OS !== "android") return;
  const clean = path.startsWith("/") ? path.slice(1) : path;
  const url = `gatimitra-merchant://${clean}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    /* try intent */
  }

  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW" as never, {
      data: url,
      flags: 268435456, // FLAG_ACTIVITY_NEW_TASK
    });
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      /* OS blocked background start — heads-up notification remains */
    }
  }
}
