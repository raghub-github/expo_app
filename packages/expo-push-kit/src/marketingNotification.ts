import { NativeModules, Platform } from "react-native";

type MarketingNative = {
  show?: (data: Record<string, unknown>) => Promise<boolean>;
  isAvailable?: () => Promise<boolean>;
};

function nativeModule(): MarketingNative | null {
  if (Platform.OS !== "android") return null;
  const mod = (NativeModules as { GatimitraMarketingNotification?: MarketingNative })
    .GatimitraMarketingNotification;
  return mod ?? null;
}

/** True when the customer build includes MarketingNotificationRenderer. */
export async function isNativeMarketingNotificationAvailable(): Promise<boolean> {
  try {
    const mod = nativeModule();
    if (!mod?.isAvailable) return false;
    return Boolean(await mod.isAvailable());
  } catch {
    return false;
  }
}

/**
 * Post a live RemoteViews marketing tray (banner / category_row / countdown Chronometer).
 * Returns false when the native module is missing (Expo Go / old binary).
 */
export async function showNativeMarketingNotification(
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const mod = nativeModule();
    if (!mod?.show) return false;
    const payload: Record<string, unknown> = { ...data };
    const layout = String(payload.layout_style ?? payload.layoutStyle ?? "")
      .trim()
      .toLowerCase();
    const countdownOn =
      payload.countdown_enabled === true ||
      payload.countdown_enabled === "true" ||
      payload.countdownEnabled === true;
    if (!layout && countdownOn) {
      payload.layout_style = "countdown";
      payload.gm_marketing_layout = "1";
    }
    return Boolean(await mod.show(payload));
  } catch {
    return false;
  }
}
