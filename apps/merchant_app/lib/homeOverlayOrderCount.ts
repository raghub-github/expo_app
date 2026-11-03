/**
 * Merchant home-screen order-count overlay state.
 *
 * Three separate states (never collapse into one boolean):
 * - nativePermissionGranted — Settings.canDrawOverlays
 * - userPreferenceEnabled — SecureStore device preference
 * - sessionDismissed — in-memory only for this JS/process session
 *
 * effectiveOverlayEnabled = permission && preference && !sessionDismissed
 * visible toggle = permission && preference
 */
import { DeviceEventEmitter, Platform } from "react-native";
import * as SecureStore from "@/lib/secureStore";
import { setPersistentOrderPill } from "@gatimitra/expo-push-kit";
import {
  openMerchantDisplayOverAppsSettings,
  readMerchantOverlayAllowed,
} from "@/lib/androidBackgroundPermissions";

export const HOME_OVERLAY_PREF_KEY = "mx_home_overlay_orders_device_v1";
export const HOME_OVERLAY_CHANGED_EVENT = "mx_home_overlay_state_changed";

/** Process-scoped dismiss. Cleared on cold start; never written to SecureStore. */
let sessionDismissed = false;

export function isHomeOverlaySessionDismissed(): boolean {
  return sessionDismissed;
}

export function markHomeOverlaySessionDismissed(): void {
  if (sessionDismissed) return;
  sessionDismissed = true;
  DeviceEventEmitter.emit(HOME_OVERLAY_CHANGED_EVENT);
}

export function clearHomeOverlaySessionDismissed(): void {
  if (!sessionDismissed) return;
  sessionDismissed = false;
  DeviceEventEmitter.emit(HOME_OVERLAY_CHANGED_EVENT);
}

/** Default ON when never set (matches prior merchant behaviour). */
export async function readHomeOverlayPreference(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(HOME_OVERLAY_PREF_KEY);
    if (raw == null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

/**
 * Persist preference only. Does not invent permission grants.
 * Turning preference OFF clears session dismiss so a later ON shows immediately.
 * Turning preference ON also clears session dismiss (explicit re-enable).
 */
export async function writeHomeOverlayPreference(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(HOME_OVERLAY_PREF_KEY, enabled ? "1" : "0");
  sessionDismissed = false;
  DeviceEventEmitter.emit(HOME_OVERLAY_CHANGED_EVENT);
}

export async function readNativeOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  return readMerchantOverlayAllowed();
}

export type HomeOverlaySnapshot = {
  nativePermissionGranted: boolean;
  userPreferenceEnabled: boolean;
  sessionDismissed: boolean;
  /** What the Preferences Switch must show. */
  toggleOn: boolean;
  /** Whether the floating circle may render. */
  effectiveOverlayEnabled: boolean;
};

export async function readHomeOverlaySnapshot(): Promise<HomeOverlaySnapshot> {
  const [nativePermissionGranted, userPreferenceEnabled] = await Promise.all([
    readNativeOverlayPermission(),
    readHomeOverlayPreference(),
  ]);
  const toggleOn = nativePermissionGranted && userPreferenceEnabled;
  const effectiveOverlayEnabled = toggleOn && !sessionDismissed;
  return {
    nativePermissionGranted,
    userPreferenceEnabled,
    sessionDismissed,
    toggleOn,
    effectiveOverlayEnabled,
  };
}

/** Idempotent mirror into native WindowManager pill. Safe to call often. */
export async function syncHomeOverlayNativePill(
  count: number,
  orderId?: string | null
): Promise<HomeOverlaySnapshot> {
  const snap = await readHomeOverlaySnapshot();
  if (Platform.OS !== "android") return snap;
  try {
    await setPersistentOrderPill(
      snap.effectiveOverlayEnabled,
      Math.max(0, Math.floor(count)),
      orderId ?? ""
    );
  } catch {
    /* native optional / Expo Go */
  }
  return snap;
}

/**
 * User flipped the Preferences toggle ON.
 * Only writes preference after Settings.canDrawOverlays is true.
 * Returns whether the toggle should show ON.
 */
export async function requestEnableHomeOverlay(): Promise<{
  toggleOn: boolean;
  openedSettings: boolean;
}> {
  if (Platform.OS !== "android") {
    await writeHomeOverlayPreference(true);
    return { toggleOn: true, openedSettings: false };
  }
  const allowed = await readNativeOverlayPermission();
  if (allowed) {
    await writeHomeOverlayPreference(true);
    return { toggleOn: true, openedSettings: false };
  }
  await openMerchantDisplayOverAppsSettings();
  return { toggleOn: false, openedSettings: true };
}

/** User flipped the Preferences toggle OFF — hide immediately. */
export async function disableHomeOverlay(): Promise<void> {
  await writeHomeOverlayPreference(false);
  if (Platform.OS === "android") {
    try {
      await setPersistentOrderPill(false, 0, "");
    } catch {
      /* ignore */
    }
  }
}

/**
 * After returning from Android Settings / App Info.
 * Never treats opening Settings as a grant — always rechecks canDrawOverlays.
 * Never overwrites a saved ON preference when the OS permission is revoked.
 */
export async function reconcileHomeOverlayAfterSettingsReturn(opts?: {
  awaitingGrant?: boolean;
}): Promise<HomeOverlaySnapshot> {
  const allowed = await readNativeOverlayPermission();
  if (opts?.awaitingGrant) {
    if (allowed) {
      await writeHomeOverlayPreference(true);
      return readHomeOverlaySnapshot();
    }
    // Still denied while awaiting — leave preference unchanged (typically still OFF).
  }
  // Permission may have changed from App Info without a preference write.
  // Notify listeners so the native pill is started/stopped with the live order count.
  DeviceEventEmitter.emit(HOME_OVERLAY_CHANGED_EVENT);
  return readHomeOverlaySnapshot();
}
