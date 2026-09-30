import * as Location from "expo-location";
import { AppState } from "react-native";
import {
  useForegroundLocationPermissionStore,
  type ForegroundLocationPermissionPhase,
} from "@/src/stores/foregroundLocationPermissionStore";

/**
 * Sole owner of Rider foreground location permission requests.
 *
 * ALWAYS call `requestForegroundPermissionsAsync()` before showing any
 * Settings fallback. Expo/Android `canAskAgain` is unreliable if we skip the
 * native request — that was causing the custom Settings modal instead of the OS dialog.
 */

export type ForegroundLocationPhase = ForegroundLocationPermissionPhase;

let requestInFlight: Promise<boolean> | null = null;
let reconcileInFlight: Promise<ForegroundLocationPermissionPhase> | null = null;
let appStateWired = false;
let previouslyGranted = false;
/** True after we have invoked the OS request API at least once this process. */
let nativeRequestAttempted = false;

function mapOsToPhase(
  status: Location.PermissionStatus,
  canAskAgain: boolean | undefined
): ForegroundLocationPermissionPhase {
  if (status === "granted") return "GRANTED";
  // Only treat as blocked AFTER a native request attempt (see request path).
  // A bare get() with canAskAgain=false must not suppress the OS dialog.
  if (canAskAgain === false && nativeRequestAttempted) {
    return "BLOCKED_OR_SETTINGS_REQUIRED";
  }
  return "REQUESTABLE";
}

function publish(
  phase: ForegroundLocationPermissionPhase,
  canAskAgain: boolean | null
): void {
  useForegroundLocationPermissionStore.getState().setPhase(phase, { canAskAgain });
}

export async function readForegroundLocationPhase(): Promise<
  "granted" | "requestable" | "denied"
> {
  const phase = await reconcileForegroundLocationPermission();
  if (phase === "GRANTED") return "granted";
  if (phase === "BLOCKED_OR_SETTINGS_REQUIRED") return "denied";
  return "requestable";
}

export async function reconcileForegroundLocationPermission(): Promise<ForegroundLocationPermissionPhase> {
  if (reconcileInFlight) return reconcileInFlight;

  reconcileInFlight = (async () => {
    const store = useForegroundLocationPermissionStore.getState();
    if (store.phase === "UNKNOWN") {
      publish("CHECKING", store.canAskAgain);
    }
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (__DEV__) {
        console.log("[FgLocationGate] get", {
          status: current.status,
          canAskAgain: current.canAskAgain,
          nativeRequestAttempted,
        });
      }
      const phase = mapOsToPhase(current.status, current.canAskAgain);
      publish(phase, current.canAskAgain ?? null);
      if (phase === "GRANTED") {
        previouslyGranted = true;
        useForegroundLocationPermissionStore.getState().setAutoPromptConsumed(false);
      } else if (previouslyGranted && phase === "REQUESTABLE") {
        previouslyGranted = false;
        useForegroundLocationPermissionStore.getState().setAutoPromptConsumed(false);
      }
      return phase;
    } catch (error) {
      console.warn("[FgLocationGate] reconcile failed:", error);
      publish("UNKNOWN", null);
      return "UNKNOWN";
    }
  })().finally(() => {
    reconcileInFlight = null;
  });

  return reconcileInFlight;
}

export type RequestForegroundLocationOptions = {
  force?: boolean;
};

/**
 * THE only path that may show the system location dialog.
 * Never short-circuits on canAskAgain before calling the OS request API.
 */
export async function requestForegroundLocationFromCoordinator(
  options?: RequestForegroundLocationOptions
): Promise<boolean> {
  const force = options?.force === true;

  if (requestInFlight) return requestInFlight;

  requestInFlight = (async () => {
    const store = useForegroundLocationPermissionStore.getState();

    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === "granted") {
        publish("GRANTED", current.canAskAgain ?? true);
        store.setAutoPromptConsumed(false);
        previouslyGranted = true;
        return true;
      }

      // Already tried OS dialog this process and still blocked — don't spam.
      if (
        !force &&
        nativeRequestAttempted &&
        current.canAskAgain === false
      ) {
        publish("BLOCKED_OR_SETTINGS_REQUIRED", false);
        return false;
      }

      if (!force && store.autoPromptConsumed) {
        // Keep requestable so Home/Duty can force later — never jump to Settings here.
        publish(
          current.canAskAgain === false && nativeRequestAttempted
            ? "BLOCKED_OR_SETTINGS_REQUIRED"
            : "REQUESTABLE",
          current.canAskAgain ?? null
        );
        return false;
      }

      publish("REQUESTING", current.canAskAgain ?? true);
      useForegroundLocationPermissionStore.getState().setAutoPromptConsumed(true);

      if (__DEV__) {
        console.log("[FgLocationGate] calling requestForegroundPermissionsAsync");
      }
      nativeRequestAttempted = true;
      const result = await Location.requestForegroundPermissionsAsync();
      if (__DEV__) {
        console.log("[FgLocationGate] request result", {
          status: result.status,
          canAskAgain: result.canAskAgain,
        });
      }

      const after = await Location.getForegroundPermissionsAsync();
      const phase = mapOsToPhase(after.status, after.canAskAgain);
      publish(phase, after.canAskAgain ?? null);

      if (after.status === "granted") {
        useForegroundLocationPermissionStore.getState().setAutoPromptConsumed(false);
        previouslyGranted = true;
        return true;
      }
      return false;
    } catch (error) {
      console.warn("[FgLocationGate] request failed:", error);
      nativeRequestAttempted = true;
      const recovered = await reconcileForegroundLocationPermission();
      return recovered === "GRANTED";
    }
  })().finally(() => {
    requestInFlight = null;
  });

  return requestInFlight;
}

/**
 * Login / tabs entry: always attempt the native dialog when not granted.
 * Do NOT skip because get() reported canAskAgain=false.
 */
export async function ensureForegroundLocationForAuthenticatedEntry(): Promise<boolean> {
  const phase = await reconcileForegroundLocationPermission();
  if (phase === "GRANTED") return true;
  return requestForegroundLocationFromCoordinator({ force: true });
}

export function presentLocationPermissionDialog(): Promise<boolean> {
  return requestForegroundLocationFromCoordinator({ force: true });
}

export async function promptForegroundLocationAgain(): Promise<boolean> {
  return requestForegroundLocationFromCoordinator({ force: true });
}

export function resetForegroundLocationPermissionCoordinator(): void {
  requestInFlight = null;
  reconcileInFlight = null;
  previouslyGranted = false;
  nativeRequestAttempted = false;
  useForegroundLocationPermissionStore.getState().reset();
}

export function wireForegroundLocationPermissionAppStateOnce(): () => void {
  if (appStateWired) return () => {};
  appStateWired = true;

  const sub = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      void reconcileForegroundLocationPermission();
    }
  });

  return () => {
    sub.remove();
    appStateWired = false;
  };
}

export async function openForegroundLocationSettings(): Promise<void> {
  const { openLocationPermissionSettings } = await import(
    "@/src/services/permissions/androidIntents"
  );
  await openLocationPermissionSettings();
}

/** For UI: Settings card only after a native request was attempted and OS still blocks. */
export function hasAttemptedNativeLocationRequest(): boolean {
  return nativeRequestAttempted;
}
