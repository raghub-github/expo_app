import {
  getBestEffortPosition,
  getFastPosition,
  getDeviceLocationReadiness,
  requestForegroundLocationPermission,
  withTimeout,
  type ValidatedCoords,
} from "@gatimitra/expo-location-kit";
import { reverseGeocode, type AddressData } from "@/src/services/location/reverseGeocoding";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";

const GEOCODE_MS = 10_000;

export type RiderLocationAcquisitionResult =
  | {
      ok: true;
      coords: ValidatedCoords;
      address: AddressData;
    }
  | {
      ok: false;
      reason: "permission_denied" | "services_disabled" | "error";
      message: string;
    };

async function geocodeOrFallback(coords: ValidatedCoords): Promise<AddressData> {
  try {
    return await withTimeout(
      reverseGeocode(coords.latitude, coords.longitude),
      GEOCODE_MS
    );
  } catch {
    return {
      city: "Unknown",
      state: "Unknown",
      pincode: "",
      address: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
      country: "IN",
    };
  }
}

/**
 * Acquire current location with shared best-effort GPS, reverse-geocode, and
 * commit into the Rider global location store (sequence-guarded).
 */
export async function acquireAndCommitRiderLocation(options?: {
  /** Skip the readiness gate when caller already verified permission + GPS. */
  assumeReady?: boolean;
  /**
   * Force a fresh device GPS reading. Rejects stale OS last-known fallbacks
   * and waits longer for acceptable accuracy (app open / foreground).
   */
  requireFresh?: boolean;
  /**
   * Last-known / Balanced only — never Highest. Use for Home lifecycle so
   * foregrounding does not start a second high-accuracy GPS session.
   */
  preferFast?: boolean;
}): Promise<RiderLocationAcquisitionResult> {
  const store = useRiderLocationStore.getState();
  const seq = store.beginAcquisition();

  try {
    if (!options?.assumeReady) {
      const readiness = await getDeviceLocationReadiness();
      store.setReadiness(readiness);
      if (readiness.permissionStatus !== "granted") {
        store.setError("Location permission is required.");
        return {
          ok: false,
          reason: "permission_denied",
          message: "Location permission is required.",
        };
      }
      if (!readiness.servicesEnabled) {
        store.setError("Please turn on Location (GPS) in settings.");
        return {
          ok: false,
          reason: "services_disabled",
          message: "Please turn on Location (GPS) in settings.",
        };
      }
    }

    const coords = options?.preferFast
      ? await getFastPosition({ lastKnownMaxAgeMs: 120_000, quickTimeoutMs: 4_000 })
      : await getBestEffortPosition(
          options?.requireFresh
            ? {
                lastKnownMaxAgeMs: 0,
                acceptableAccuracyM: 35,
                stableWaitMs: 12_000,
                maxAttempts: 5,
              }
            : undefined
        );
    const address = await geocodeOrFallback(coords);
    const committed = store.commitAcquisition(seq, { coords, address });
    if (!committed) {
      return {
        ok: false,
        reason: "error",
        message: "Location update was superseded.",
      };
    }
    return { ok: true, coords, address };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to capture location";
    if (seq === useRiderLocationStore.getState().acquisitionSeq) {
      store.setError(message);
    }
    return { ok: false, reason: "error", message };
  }
}

/**
 * Ensure foreground permission + GPS readiness, then acquire + commit location.
 * Does not open settings — callers handle settings deep-links.
 */
export async function ensureForegroundReadyAndAcquire(): Promise<RiderLocationAcquisitionResult> {
  const permission = await requestForegroundLocationPermission();
  const readiness = await getDeviceLocationReadiness();
  useRiderLocationStore.getState().setReadiness({
    ...readiness,
    permissionStatus: permission === "granted" ? "granted" : permission,
  });

  if (permission !== "granted") {
    return {
      ok: false,
      reason: "permission_denied",
      message: "Location permission is required.",
    };
  }
  if (!readiness.servicesEnabled) {
    return {
      ok: false,
      reason: "services_disabled",
      message: "Please turn on Location (GPS) in settings.",
    };
  }

  return acquireAndCommitRiderLocation({ assumeReady: true });
}

export function riderLocationToCaptureData(result: Extract<RiderLocationAcquisitionResult, { ok: true }>) {
  return {
    lat: parseFloat(result.coords.latitude.toFixed(8)),
    lon: parseFloat(result.coords.longitude.toFixed(8)),
    city: result.address.city,
    state: result.address.state,
    pincode: result.address.pincode,
    address: result.address.address,
    country: result.address.country,
  };
}
