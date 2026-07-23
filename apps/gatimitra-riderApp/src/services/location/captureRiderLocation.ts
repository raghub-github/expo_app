import { AppState, Platform } from "react-native";
import * as Location from "expo-location";
import { openLocationServicesSettings } from "@/src/services/permissions/androidIntents";
import type { LocationCaptureData } from "@/src/hooks/useLocationCapture";
import {
  acquireAndCommitRiderLocation,
  ensureForegroundReadyAndAcquire,
  riderLocationToCaptureData,
} from "@/src/services/location/riderLocationController";

export type CaptureLocationResult =
  | { ok: true; data: LocationCaptureData }
  | { ok: false; reason: "permission_denied" | "services_disabled" | "error"; message: string };

const LOCATION_SERVICES_WAIT_MS = 90_000;

/** Wait until the rider turns on device Location/GPS (returns to app from settings). */
async function waitForDeviceLocationServicesEnabled(): Promise<boolean> {
  if (await Location.hasServicesEnabledAsync()) {
    return true;
  }

  if (Platform.OS === "android") {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // User dismissed system dialog — fall through to settings.
    }
    if (await Location.hasServicesEnabledAsync()) {
      return true;
    }
  }

  await openLocationServicesSettings();

  if (await Location.hasServicesEnabledAsync()) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription.remove();
      resolve(value);
    };

    const timeout = setTimeout(() => finish(false), LOCATION_SERVICES_WAIT_MS);

    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;
      try {
        if (await Location.hasServicesEnabledAsync()) {
          finish(true);
        }
      } catch {
        // keep waiting until timeout
      }
    });
  });
}

/** Request permission, ensure GPS on, capture fix, and reverse-geocode via shared controller. */
export async function captureRiderLocationWithPermission(): Promise<CaptureLocationResult> {
  try {
    const first = await ensureForegroundReadyAndAcquire();
    if (first.ok) {
      return { ok: true, data: riderLocationToCaptureData(first) };
    }

    if (first.reason === "permission_denied") {
      return {
        ok: false,
        reason: "permission_denied",
        message: "Location permission is required to save your address.",
      };
    }

    if (first.reason === "services_disabled") {
      const servicesEnabled = await waitForDeviceLocationServicesEnabled();
      if (!servicesEnabled) {
        return {
          ok: false,
          reason: "services_disabled",
          message: "Please turn on Location (GPS) in settings, then try again.",
        };
      }
      const second = await acquireAndCommitRiderLocation({ assumeReady: true });
      if (second.ok) {
        return { ok: true, data: riderLocationToCaptureData(second) };
      }
      return {
        ok: false,
        reason: second.reason,
        message: second.message,
      };
    }

    return {
      ok: false,
      reason: "error",
      message: first.message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture location";
    return { ok: false, reason: "error", message };
  }
}
