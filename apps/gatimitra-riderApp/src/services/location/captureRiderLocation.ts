// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import * as Location from "expo-location";
import { reverseGeocode } from "@/src/services/location/reverseGeocoding";
import type { LocationCaptureData } from "@/src/hooks/useLocationCapture";

export type CaptureLocationResult =
  | { ok: true; data: LocationCaptureData }
  | { ok: false; reason: "permission_denied" | "services_disabled" | "error"; message: string };

/** Request foreground permission, capture GPS fix, and reverse-geocode to a full address. */
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

    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      return {
        ok: false,
        reason: "services_disabled",
        message: "Please turn on GPS/location services.",
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
