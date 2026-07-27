/**
 * Android intents for merchant background wake (battery + display-over-apps).
 */
import { Platform, Linking } from "react-native";
import Constants from "expo-constants";

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

async function openAndroidAppDetails(): Promise<void> {
  const IntentLauncher = await import("expo-intent-launcher");
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
    { data: `package:${getAndroidPackageName()}` }
  );
}

async function tryStart(action: string, options?: { data?: string }): Promise<boolean> {
  try {
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(action as never, options ?? {});
    return true;
  } catch {
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
  const IntentLauncher = await import("expo-intent-launcher");

  if (mode === "request") {
    const opened = await tryStart(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${packageName}` }
    );
    if (opened) return;
  }

  if (await tryStart(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) {
    return;
  }

  try {
    await openAndroidAppDetails();
  } catch {
    await Linking.openSettings();
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
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
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
  const IntentLauncher = await import("expo-intent-launcher");
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.MANAGE_OVERLAY_PERMISSION,
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
    const IntentLauncher = await import("expo-intent-launcher");
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
