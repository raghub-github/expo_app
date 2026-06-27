/**
 * Location global state - permission, coords, reverse-geocoded address.
 *
 * Behavior:
 * - During a single app session, user can select a different location and we use it.
 * - On app restart, we restore the last explicitly selected location (saved address / pin / recent),
 *   so home header does not jump back to an older/previous location.
 */

import { create } from "zustand";
import * as Location from "expo-location";
import { reverseGeocode, type ReverseGeocodeResult } from "@/services/location.service";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadPersistedWeatherSnapshot } from "@/lib/weatherCacheStorage";

/** Avoid indefinite hang from getCurrentPositionAsync (common with Highest accuracy indoors). */
const GPS_ATTEMPT_MS = 14_000;
const GEOCODE_MS = 10_000;
const STORAGE_KEY = "@gatimitra/last_selected_location_v1";

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
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as PersistedSelectedLocation) : null;
      if (
        parsed &&
        parsed.coords &&
        typeof parsed.coords.latitude === "number" &&
        typeof parsed.coords.longitude === "number" &&
        parsed.address &&
        typeof parsed.address === "object"
      ) {
        await loadPersistedWeatherSnapshot(parsed.coords.latitude, parsed.coords.longitude);
        set({
          coords: parsed.coords,
          address: parsed.address,
          locationSource: "selected",
          locationHydrated: true,
        });
        return;
      }
    } catch {
      // ignore
    }
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
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
    }
  },

  requestPermissionAndFetch: async (options) => {
    const forceDevice = options?.forceDevice === true;
    // Mark hydrated on first attempt; hydration may also come from AsyncStorage.
    if (!get().locationHydrated) set({ locationHydrated: true });

    // If user explicitly selected a location, do not override it with GPS unless forced.
    if (!forceDevice && get().locationSource === "selected" && get().coords && get().address) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const readiness = await getDeviceLocationReadiness();
      if (readiness.isReady) {
        set({ permissionStatus: "granted", showPermissionModal: false });
        const { latitude, longitude } = await getDeviceCoords();
        set({ coords: { latitude, longitude } });
        const address = await geocodeOrFallback(longitude, latitude);
        set({ address, loading: false, locationSource: "current" });
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
