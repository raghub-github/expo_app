/**
 * Location global state - permission, coords, reverse-geocoded address.
 *
 * Priority for nearby merchants / home discovery:
 * 1. Live GPS ("current") — default on cold start and app resume
 * 2. Explicit user-selected pin ("selected") — only after the user picks a saved
 *    address / map pin this session
 * 3. Saved / server active-location — checkout convenience only; never drives
 *    merchant listing by itself
 *
 * Persisted "last selected" pins are NOT restored as selected on cold start so a
 * previous city (e.g. Bihar) cannot keep showing after the user travels (e.g. Delhi).
 */

import { create } from "zustand";
import * as Location from "expo-location";
import { reverseGeocode, type ReverseGeocodeResult } from "@/services/location.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { haversineKm } from "@/lib/billSummary";

/** Avoid indefinite hang from getCurrentPositionAsync (common with Highest accuracy indoors). */
const GPS_ATTEMPT_MS = 14_000;
const GEOCODE_MS = 10_000;
const STORAGE_KEY = "@gatimitra/last_selected_location_v1";
/** Refresh merchants when the user moves at least this far (meters). */
export const LOCATION_SIGNIFICANT_MOVE_METERS = 350;
/** Max age for last-known GPS fallback when a fresh fix fails. */
const LAST_KNOWN_MAX_AGE_MS = 60_000;

type PersistedSelectedLocation = {
  coords: { latitude: number; longitude: number };
  address: ReverseGeocodeResult;
  savedAt: number;
};

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
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
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

export function coordsMovedSignificantly(
  a: { latitude: number; longitude: number } | null | undefined,
  b: { latitude: number; longitude: number } | null | undefined,
  thresholdMeters = LOCATION_SIGNIFICANT_MOVE_METERS
): boolean {
  if (!a || !b) return a !== b;
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000 >= thresholdMeters;
}

export type LocationPermissionStatus = "undetermined" | "granted" | "denied";

export type DeviceLocationReadiness = {
  permissionStatus: LocationPermissionStatus;
  servicesEnabled: boolean;
  isReady: boolean;
};

/** App permission + device GPS/location toggle (quick settings). */
export async function getDeviceLocationReadiness(): Promise<DeviceLocationReadiness> {
  const [{ status }, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
  ]);
  const permissionStatus: LocationPermissionStatus =
    status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
  return {
    permissionStatus,
    servicesEnabled,
    isReady: permissionStatus === "granted" && servicesEnabled,
  };
}

/** User-chosen pin vs device GPS – selected wins for listing until explicit "use current location". */
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
  /** User closed the sheet this session — re-prompt on next cold start only. */
  locationSheetDismissedSession: boolean;
  hydrate: () => Promise<void>;
  clearPersistedSelection: () => Promise<void>;
  requestPermissionAndFetch: (options?: { forceDevice?: boolean }) => Promise<void>;
  setShowPermissionModal: (show: boolean) => void;
  /** Show location sheet on launch until app permission + device location are both on. */
  promptLocationPermissionIfNeeded: (options?: { force?: boolean }) => Promise<void>;
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
  locationSheetDismissedSession: false,

  hydrate: async () => {
    if (get().locationHydrated) return;
    // Clear any previously persisted selected pin so cold start cannot lock onto an old city.
    // Explicit selections are session-scoped; live GPS is the default for discovery.
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    set({ locationHydrated: true });
  },

  clearPersistedSelection: async () => {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  setShowPermissionModal: (show) =>
    set({
      showPermissionModal: show,
      ...(show ? { locationSheetDismissedSession: false } : { locationSheetDismissedSession: true }),
    }),

  promptLocationPermissionIfNeeded: async (options) => {
    try {
      const readiness = await getDeviceLocationReadiness();
      if (readiness.isReady) {
        set({
          permissionStatus: "granted",
          showPermissionModal: false,
          locationSheetDismissedSession: false,
        });
        const { locationSource, coords, address } = get();
        // Keep an explicit in-session selection; otherwise always refresh live GPS.
        if (locationSource === "selected" && coords && address) {
          return;
        }
        await get().requestPermissionAndFetch({ forceDevice: true });
        return;
      }
      if (!options?.force && get().locationSheetDismissedSession) {
        set({ permissionStatus: readiness.permissionStatus });
        return;
      }
      set({
        permissionStatus: readiness.permissionStatus,
        showPermissionModal: true,
      });
    } catch {
      if (!options?.force && get().locationSheetDismissedSession) return;
      set({ showPermissionModal: true });
    }
  },

  setAddress: (address) => set({ address }),

  setAddressAndCoords: (address, coords, meta) => {
    const source: LocationSource = meta?.source ?? "selected";
    const prev = get();
    const sameCoords =
      prev.coords != null &&
      Math.abs(prev.coords.latitude - coords.latitude) < 1e-6 &&
      Math.abs(prev.coords.longitude - coords.longitude) < 1e-6;
    const sameAddress =
      prev.address?.fullAddress === address.fullAddress &&
      prev.address?.primary === address.primary &&
      prev.address?.secondary === address.secondary &&
      prev.address?.city === address.city &&
      prev.address?.state === address.state &&
      prev.address?.pincode === address.pincode;
    if (sameCoords && sameAddress && prev.locationSource === source) {
      return;
    }
    set({ address, coords, locationSource: source });
    if (source === "selected") {
      const payload: PersistedSelectedLocation = {
        coords,
        address,
        savedAt: Date.now(),
      };
      // Session backup only — hydrate() clears this on next cold start.
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  },

  requestPermissionAndFetch: async (options) => {
    const forceDevice = options?.forceDevice === true;
    // Mark hydrated on first attempt; hydration may also come from AsyncStorage clear.
    if (!get().locationHydrated) set({ locationHydrated: true });

    // If user explicitly selected a location this session, do not override with GPS unless forced.
    if (!forceDevice && get().locationSource === "selected" && get().coords && get().address) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const readiness = await getDeviceLocationReadiness();
      if (readiness.isReady) {
        set({ permissionStatus: "granted", showPermissionModal: false });
        const { latitude, longitude } = await getDeviceCoords();
        const address = await geocodeOrFallback(longitude, latitude);
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        set({
          coords: { latitude, longitude },
          address,
          loading: false,
          locationSource: "current",
        });
        return;
      }
      if (readiness.permissionStatus === "denied") {
        set({
          permissionStatus: "denied",
          showPermissionModal: true,
          loading: false,
        });
        return;
      }
      if (readiness.permissionStatus === "undetermined") {
        set({
          permissionStatus: "undetermined",
          showPermissionModal: true,
          loading: false,
        });
        return;
      }
      // App permission granted but device location toggle is off.
      set({
        permissionStatus: "granted",
        showPermissionModal: true,
        loading: false,
      });
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

    const { permissionStatus } = get();
    if (permissionStatus !== "granted") return;
    set({ loading: true, error: null });
    try {
      const { latitude, longitude } = await getDeviceCoords();
      const address = await geocodeOrFallback(longitude, latitude);
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      set({
        coords: { latitude, longitude },
        address,
        loading: false,
        locationSource: "current",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({ error: message, loading: false });
    }
  },
}));
