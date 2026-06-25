// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { AppState } from "react-native";
import * as Location from "expo-location";
import { reverseGeocode } from "@/src/services/location/reverseGeocoding";
import { openLocationServicesSettings } from "@/src/services/permissions/androidIntents";
import type { LocationCaptureData } from "@/src/hooks/useLocationCapture";

export type CaptureLocationResult =
  | { ok: true; data: LocationCaptureData }
  | { ok: false; reason: "permission_denied" | "services_disabled" | "error"; message: string };

const LOCATION_SERVICES_WAIT_MS = 90_000;

/** Wait until the rider turns on device Location/GPS (returns to app from settings). */
async function waitForDeviceLocationServicesEnabled(): Promise<boolean> {
  if (await Location.hasServicesEnabledAsync()) {
    return true;
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

/** Request permission, ensure GPS on, capture fix, and reverse-geocode. */
export async function captureRiderLocationWithPermission(): Promise<CaptureLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return {
        ok: false,
        reason: "permission_denied",
        message: "Location permission is required to save your address.",
      };
    }

    const servicesEnabled = await waitForDeviceLocationServicesEnabled();
    if (!servicesEnabled) {
      return {
        ok: false,
        reason: "services_disabled",
        message: "Please turn on Location (GPS) in settings, then try again.",
      };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
      maximumAge: 10000,
    });

    const lat = parseFloat(location.coords.latitude.toFixed(8));
    const lon = parseFloat(location.coords.longitude.toFixed(8));
    const addressData = await reverseGeocode(lat, lon);

    return {
      ok: true,
      data: {
        lat,
        lon,
        city: addressData.city,
        state: addressData.state,
        pincode: addressData.pincode,
        address: addressData.address,
        country: addressData.country,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to capture location";
    return { ok: false, reason: "error", message };
  }
}
