/**
 * Location global state - permission, coords, reverse-geocoded address.
 *
 * Industry-standard behavior (Zomato/Swiggy-style):
 * - During a single app session, user can select a different location and we use it.
 * - On app restart, we DO NOT restore any previously selected location.
 * - No persistence to AsyncStorage/local storage. Everything is in-memory only.
 */

import { create } from "zustand";
import * as Location from "expo-location";
import { reverseGeocode, type ReverseGeocodeResult } from "@/services/location.service";

/** Avoid indefinite hang from getCurrentPositionAsync (common with Highest accuracy indoors). */
const GPS_ATTEMPT_MS = 14_000;
const GEOCODE_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Location request timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function getDeviceCoords(): Promise<{ latitude: number; longitude: number }> {
  const accAttempts = [Location.Accuracy.Balanced, Location.Accuracy.Lowest];
  let lastErr: unknown;
  for (const accuracy of accAttempts) {
    try {
      const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy }), GPS_ATTEMPT_MS);
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch (e) {
      lastErr = e;
    }
  }
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 600_000 });
    if (lastKnown?.coords) {
      return {
        latitude: lastKnown.coords.latitude,
        longitude: lastKnown.coords.longitude,
      };
    }
  } catch {
    // ignore
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error("Could not get device location");
}

async function geocodeOrFallback(longitude: number, latitude: number): Promise<ReverseGeocodeResult> {
  try {
    return await withTimeout(reverseGeocode(longitude, latitude), GEOCODE_MS);
  } catch {
    const coords = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    return {
      primary: "Current location",
      secondary: coords,
      fullAddress: coords,
      city: null,
      state: null,
      pincode: null,
    };
  }
}

export type LocationPermissionStatus = "undetermined" | "granted" | "denied";

/** User-chosen pin vs device GPS – selected always wins for listing until explicit "use current location". */
export type LocationSource = "selected" | "current";

type LocationState = {
  permissionStatus: LocationPermissionStatus;
  loading: boolean;
  error: string | null;
  coords: { latitude: number; longitude: number } | null;
  address: ReverseGeocodeResult | null;
  /** null until first fetch; then reflects last explicit source (GPS vs user selection). */
  locationSource: LocationSource | null;
  /** True after initial in-memory bootstrap attempt (success or empty). */
  locationHydrated: boolean;
  showPermissionModal: boolean;
  requestPermissionAndFetch: (options?: { forceDevice?: boolean }) => Promise<void>;
  setShowPermissionModal: (show: boolean) => void;
  setAddress: (address: ReverseGeocodeResult | null) => void;
  setAddressAndCoords: (
    address: ReverseGeocodeResult,
    coords: { latitude: number; longitude: number },
    meta?: { source?: LocationSource }
  ) => void;
  refetchLocation: (options?: { forceDevice?: boolean }) => Promise<void>;
};

export const useLocationStore = create<LocationState>((set, get) => ({
  permissionStatus: "undetermined",
  loading: false,
  error: null,
  coords: null,
  address: null,
  locationSource: null,
  locationHydrated: false,
  showPermissionModal: false,

  setShowPermissionModal: (show) => set({ showPermissionModal: show }),

  setAddress: (address) => set({ address }),

  setAddressAndCoords: (address, coords, meta) => {
    const source: LocationSource = meta?.source ?? "selected";
    set({ address, coords, locationSource: source });
  },

  requestPermissionAndFetch: async (options) => {
    const forceDevice = options?.forceDevice === true;
    // Mark hydrated on first attempt (no persistence to restore).
    if (!get().locationHydrated) set({ locationHydrated: true });

    set({ loading: true, error: null });
    try {
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      if (existing === "granted") {
        set({ permissionStatus: "granted", showPermissionModal: false });
        const { latitude, longitude } = await getDeviceCoords();
        set({ coords: { latitude, longitude } });
        const address = await geocodeOrFallback(longitude, latitude);
        set({ address, loading: false, locationSource: "current" });
        return;
      }
      if (existing === "denied") {
        set({
          permissionStatus: "denied",
          showPermissionModal: true,
          loading: false,
        });
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        set({ permissionStatus: "granted", showPermissionModal: false });
        const { latitude, longitude } = await getDeviceCoords();
        set({ coords: { latitude, longitude } });
        const address = await geocodeOrFallback(longitude, latitude);
        set({ address, loading: false, locationSource: "current" });
      } else {
        set({
          permissionStatus: "denied",
          showPermissionModal: true,
          loading: false,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({
        error: message,
        loading: false,
        showPermissionModal: true,
      });
    }
  },

  refetchLocation: async (options) => {
    const forceDevice = options?.forceDevice === true;
    if (!forceDevice && get().locationSource === "selected") return;

    const { permissionStatus, coords } = get();
    if (permissionStatus !== "granted" || !coords) return;
    set({ loading: true, error: null });
    try {
      const { latitude, longitude } = await getDeviceCoords();
      set({ coords: { latitude, longitude } });
      const address = await geocodeOrFallback(longitude, latitude);
      set({ address, loading: false, locationSource: "current" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({ error: message, loading: false });
    }
  },
}));
