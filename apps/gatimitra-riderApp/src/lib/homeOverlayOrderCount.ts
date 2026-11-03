/**
 * Rider home-screen order-count overlay state.
 *
 * Three separate states (never collapse into one boolean):
 * - nativePermissionGranted — Settings.canDrawOverlays
 * - userPreferenceEnabled — SecureStore / AsyncStorage device preference
 * - sessionDismissed — in-memory only for this JS/process session
 *
 * Package-scoped: never shares state with the merchant app.
 */
import { DeviceEventEmitter, Platform } from "react-native";
import {
  canDrawNativeOverlays,
  setPersistentOrderPill,
} from "@gatimitra/expo-push-kit";
import { getItem, setItem } from "@/src/utils/storage";
import { openDisplayOverOtherAppsSettings } from "@/src/services/permissions/androidIntents";

export const HOME_OVERLAY_PREF_KEY = "rider_home_overlay_orders_device_v1";
export const HOME_OVERLAY_CHANGED_EVENT = "rider_home_overlay_state_changed";

/** Process-scoped dismiss. Cleared on cold start; never persisted. */
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

/** Default ON when never set — matches prior rider behaviour (pill when overlay allowed). */
export async function readHomeOverlayPreference(): Promise<boolean> {
  try {
    const raw = await getItem(HOME_OVERLAY_PREF_KEY);
    if (raw == null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export async function writeHomeOverlayPreference(enabled: boolean): Promise<void> {
  await setItem(HOME_OVERLAY_PREF_KEY, enabled ? "1" : "0");
  sessionDismissed = false;
  DeviceEventEmitter.emit(HOME_OVERLAY_CHANGED_EVENT);
}

export async function readNativeOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const native = await canDrawNativeOverlays();
    if (native === true || native === false) return native;
  } catch {
    /* Expo Go / missing module */
  }
  return false;
}

export type HomeOverlaySnapshot = {
  nativePermissionGranted: boolean;
  userPreferenceEnabled: boolean;
  sessionDismissed: boolean;
  toggleOn: boolean;
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
    /* native optional */
  }
  return snap;
}

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
  await openDisplayOverOtherAppsSettings();
  return { toggleOn: false, openedSettings: true };
}

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

export async function reconcileHomeOverlayAfterSettingsReturn(opts?: {
  awaitingGrant?: boolean;
}): Promise<HomeOverlaySnapshot> {
  const allowed = await readNativeOverlayPermission();
  if (opts?.awaitingGrant) {
    if (allowed) {
      await writeHomeOverlayPreference(true);
      return readHomeOverlaySnapshot();
    }
  }
  DeviceEventEmitter.emit(HOME_OVERLAY_CHANGED_EVENT);
  return readHomeOverlaySnapshot();
}
