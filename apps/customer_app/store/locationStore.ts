/**
 * Location global state - permission, coords, reverse-geocoded address.
 *
 * Priority for nearby merchants / home discovery:
 * 1. Live GPS ("current") — default when no bound saved address, or after backend
 *    reconcile switches away from a saved address the user has traveled far from
 * 2. Explicit / backend-kept saved address ("selected") — after user picks Saved/Add New,
 *    or when POST /active-location/reconcile keeps the bound address (GPS still nearby)
 * 3. Server active-location — single source of truth; client applies reconcile responses
 *
 * Cold start clears local AsyncStorage selection; backend reconcile may restore a
 * still-nearby saved address from customer_active_location.address_id.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LOCATION_SIGNIFICANT_MOVE_METERS,
  coordsMovedSignificantly,
  getBestEffortPosition,
  getDeviceLocationReadiness,
  withTimeout,
  type LocationPermissionStatus,
  type DeviceLocationReadiness,
} from "@gatimitra/expo-location-kit";
import { reverseGeocode, type ReverseGeocodeResult } from "@/services/location.service";
import { isSmsBlockingLocationPrompts } from "@/store/smsPermissionStore";

export {
  LOCATION_SIGNIFICANT_MOVE_METERS,
  coordsMovedSignificantly,
  getDeviceLocationReadiness,
};
export type { LocationPermissionStatus, DeviceLocationReadiness };

const GEOCODE_MS = 10_000;
const STORAGE_KEY = "@gatimitra/last_selected_location_v1";
/** Toggle verbose location logging for field debugging (raw coords, accuracy, PIN). */
const LOCATION_DEBUG = __DEV__;

function logLocation(event: string, data: Record<string, unknown>): void {
  if (!LOCATION_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`[location] ${event}`, { ...data, ts: new Date().toISOString() });
}

type PersistedSelectedLocation = {
  coords: { latitude: number; longitude: number };
  address: ReverseGeocodeResult;
  savedAt: number;
};

async function getDeviceCoords(): Promise<{ latitude: number; longitude: number }> {
  const v = await getBestEffortPosition({
    log: logLocation,
  });
  return { latitude: v.latitude, longitude: v.longitude };
}

async function geocodeOrFallback(longitude: number, latitude: number): Promise<ReverseGeocodeResult> {
  try {
    const result = await withTimeout(reverseGeocode(longitude, latitude), GEOCODE_MS);
    logLocation("reverse-geocode", {
      latitude,
      longitude,
      provider: result.provider,
      primary: result.primary,
      city: result.city,
      state: result.state,
      pincode: result.pincode,
      distanceM: result.distanceM,
      approximate: result.approximate,
      fullAddress: result.fullAddress,
    });
    if (result.approximate) {
      logLocation("reverse-geocode-approximate", {
        latitude,
        longitude,
        nearestFeatureM: result.distanceM,
        pincode: result.pincode,
        note: "nearest mapped feature is far from GPS — street/PIN is a best-effort approximation for this area",
      });
    }
    return result;
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

/** User-chosen pin vs device GPS – selected wins for listing until explicit "use current location". */
export type LocationSource = "selected" | "current";

/**
 * nearby = GPS was within retention at select time (resume may auto-switch if user travels).
 * remote = intentional "order for someone else" (resume must keep until cold start).
 */
export type SessionSelectionKind = "nearby" | "remote";

/**
 * Monotonic token for live-GPS fetches. getDeviceCoords()+reverseGeocode() is async, so two
 * overlapping fetches can finish out of order; a fetch only commits its coords/address if its
 * token is still the latest — an older (slower) reverse-geocode can never overwrite a newer GPS fix.
 */
let locationFetchSeq = 0;

type LocationState = {
  permissionStatus: LocationPermissionStatus;
  loading: boolean;
  error: string | null;
  coords: { latitude: number; longitude: number } | null;
  address: ReverseGeocodeResult | null;
  /** null until first fetch; then reflects last explicit source (GPS vs user selection). */
  locationSource: LocationSource | null;
  /**
   * In-session classification of the last Saved Address pick.
   * Cleared on cold start hydrate and when switching to Current Location.
   */
  sessionSelectionKind: SessionSelectionKind | null;
  /** Bound saved address id for this session selection (for remote restore after resume). */
  sessionBoundAddressId: number | null;
  /** True after initial in-memory bootstrap attempt (success or empty). */
  locationHydrated: boolean;
  showPermissionModal: boolean;
  /** User closed the sheet this session — re-prompt on next cold start only. */
  locationSheetDismissedSession: boolean;
  hydrate: () => Promise<void>;
  clearPersistedSelection: () => Promise<void>;
  requestPermissionAndFetch: (options?: { forceDevice?: boolean }) => Promise<void>;
  setShowPermissionModal: (show: boolean) => void;
  /**
   * Show location sheet on launch until app permission + device location are both on.
   * `skipDeviceFetch`: only ensure permission / sheet state — do not push GPS into the
   * store (cold-start / resume reconcile owns that decision).
   */
  promptLocationPermissionIfNeeded: (options?: {
    force?: boolean;
    skipDeviceFetch?: boolean;
  }) => Promise<void>;
  setAddress: (address: ReverseGeocodeResult | null) => void;
  setAddressAndCoords: (
    address: ReverseGeocodeResult,
    coords: { latitude: number; longitude: number },
    meta?: {
      source?: LocationSource;
      selectionKind?: SessionSelectionKind | null;
      boundAddressId?: number | null;
    }
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
  sessionSelectionKind: null,
  sessionBoundAddressId: null,
  locationHydrated: false,
  showPermissionModal: false,
  locationSheetDismissedSession: false,

  hydrate: async () => {
    if (get().locationHydrated) return;
    // Clear any previously persisted selected pin so cold start cannot lock onto an old city.
    // Explicit selections are session-scoped; live GPS is the default for discovery.
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    set({
      locationHydrated: true,
      sessionSelectionKind: null,
      sessionBoundAddressId: null,
    });
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
    // SMS step owns the screen first — never open location sheet or GPS dialogs over it.
    if (isSmsBlockingLocationPrompts()) {
      return;
    }
    try {
      const readiness = await getDeviceLocationReadiness();
      if (readiness.isReady) {
        set({
          permissionStatus: "granted",
          showPermissionModal: false,
          locationSheetDismissedSession: false,
        });
        if (options?.skipDeviceFetch) {
          return;
        }
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
    const selectionKind =
      source === "selected"
        ? (meta?.selectionKind ?? prev.sessionSelectionKind ?? "nearby")
        : null;
    const boundAddressId =
      source === "selected"
        ? (meta?.boundAddressId !== undefined
            ? meta.boundAddressId
            : prev.sessionBoundAddressId)
        : null;
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
    if (
      sameCoords &&
      sameAddress &&
      prev.locationSource === source &&
      prev.sessionSelectionKind === selectionKind &&
      prev.sessionBoundAddressId === boundAddressId
    ) {
      return;
    }
    set({
      address,
      coords,
      locationSource: source,
      sessionSelectionKind: selectionKind,
      sessionBoundAddressId: boundAddressId,
    });
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
    if (isSmsBlockingLocationPrompts()) {
      return;
    }
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
        const seq = ++locationFetchSeq;
        const { latitude, longitude } = await getDeviceCoords();
        const address = await geocodeOrFallback(longitude, latitude);
        if (seq !== locationFetchSeq) return; // superseded by a newer GPS fetch — don't overwrite
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        set({
          coords: { latitude, longitude },
          address,
          loading: false,
          locationSource: "current",
          sessionSelectionKind: null,
          sessionBoundAddressId: null,
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
    if (isSmsBlockingLocationPrompts()) {
      return;
    }
    const forceDevice = options?.forceDevice === true;
    if (!forceDevice && get().locationSource === "selected") return;

    const { permissionStatus } = get();
    if (permissionStatus !== "granted") return;
    set({ loading: true, error: null });
    try {
      const seq = ++locationFetchSeq;
      const { latitude, longitude } = await getDeviceCoords();
      const address = await geocodeOrFallback(longitude, latitude);
      if (seq !== locationFetchSeq) return; // superseded by a newer GPS fetch — don't overwrite
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      set({
        coords: { latitude, longitude },
        address,
        loading: false,
        locationSource: "current",
        sessionSelectionKind: null,
        sessionBoundAddressId: null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({ error: message, loading: false });
    }
  },
}));
