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
  getFastPosition,
  getDeviceLocationReadiness,
  withTimeout,
  type LocationPermissionStatus,
  type DeviceLocationReadiness,
} from "@gatimitra/expo-location-kit";
import {
  reverseGeocode,
  seedReverseGeocodeCache,
  type ReverseGeocodeResult,
} from "@/services/location.service";
import {
  loadLastKnownLocation,
  peekLastKnownLocation,
  saveLastKnownLocation,
  classifyFreshness,
  type LocationFreshness,
  type PersistedDeviceLocation,
} from "@/lib/lastKnownLocationCache";
import { shouldReplaceFix } from "@/lib/locationFixSelection";

function isSmsBlockingLocationPrompts(): boolean {
  try {
    // Lazy — locationStore must not import smsPermissionStore at module load
    // (that cycle pulled authStore before it finished initializing).
    return (
      require("@/store/smsPermissionStore") as typeof import("@/store/smsPermissionStore")
    ).isSmsBlockingLocationPrompts();
  } catch {
    return false;
  }
}

export {
  LOCATION_SIGNIFICANT_MOVE_METERS,
  coordsMovedSignificantly,
  getDeviceLocationReadiness,
};
export type { LocationPermissionStatus, DeviceLocationReadiness };

const GEOCODE_MS = 1_200;
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
    // Never put raw lat,lng into customer-facing address fields.
    return {
      primary: "Current location",
      secondary: "",
      fullAddress: "Current location",
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

/** Per-commit token: only the newest committed coordinate's async geocode is applied. */
let addressCommitSeq = 0;

/** Dev-only performance metrics: app-action → each location milestone (section 26). */
type LocationMetric =
  | "location_permission_ms"
  | "last_known_location_ms"
  | "first_location_fix_ms"
  | "accurate_location_fix_ms"
  | "reverse_geocode_ms"
  | "total_location_ready_ms";

function logMetric(metric: LocationMetric, ms: number): void {
  if (!LOCATION_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`[location:perf] ${metric} = ${Math.round(ms)}ms`);
}

type DeviceFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestampMs: number;
  source: PersistedDeviceLocation["source"];
};

function currentDeviceFix(): DeviceFix | null {
  const s = useLocationStore.getState();
  if (!s.coords) return null;
  return {
    latitude: s.coords.latitude,
    longitude: s.coords.longitude,
    accuracy: s.coordsAccuracy,
    timestampMs: s.coordsUpdatedAt ?? 0,
    source: (s.coordsSource as PersistedDeviceLocation["source"]) ?? "last-known",
  };
}

/**
 * Commit device coordinates immediately — the coordinate is shown BEFORE reverse-geocoding
 * (section 10) — persist them, then reverse-geocode asynchronously and fill the address when
 * it resolves. A per-commit token guarantees only the latest coordinate's address is applied.
 */
function isPlaceholderAddress(address: ReverseGeocodeResult | null | undefined): boolean {
  if (!address) return true;
  const primary = (address.primary ?? "").trim().toLowerCase();
  return (
    (primary === "" || primary === "current location") &&
    !address.city &&
    !address.state &&
    !address.pincode
  );
}

function commitDeviceFix(fix: DeviceFix, opts: { refining: boolean }): void {
  const addrToken = ++addressCommitSeq;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {}); // drop any stale selected pin
  const prevAddress = useLocationStore.getState().address;
  const keepVisibleAddress = !isPlaceholderAddress(prevAddress);
  useLocationStore.setState({
    coords: { latitude: fix.latitude, longitude: fix.longitude },
    coordsAccuracy: fix.accuracy,
    coordsUpdatedAt: fix.timestampMs,
    coordsSource: fix.source,
    locationFreshness: classifyFreshness(fix.timestampMs),
    locationSource: "current",
    sessionSelectionKind: null,
    sessionBoundAddressId: null,
    loading: false,
    // Keep the last real label on screen while Mapbox runs — never flash "Updating…".
    refining: keepVisibleAddress ? false : opts.refining,
    error: null,
  });
  saveLastKnownLocation({
    lat: fix.latitude,
    lon: fix.longitude,
    accuracy: fix.accuracy,
    updatedAt: fix.timestampMs,
    source: fix.source,
    address: prevAddress,
  });
  const geoT0 = Date.now();
  void (async () => {
    const address = await geocodeOrFallback(fix.longitude, fix.latitude);
    if (addrToken !== addressCommitSeq) return; // superseded by a newer fix
    if (useLocationStore.getState().locationSource === "selected") return;
    logMetric("reverse_geocode_ms", Date.now() - geoT0);
    const prev = useLocationStore.getState().address;
    // Timed-out / empty Mapbox must never replace a real street label with "Current location".
    const nextAddress = isPlaceholderAddress(address) && !isPlaceholderAddress(prev) ? prev : address;
    useLocationStore.setState({ address: nextAddress, refining: false });
    saveLastKnownLocation({
      lat: fix.latitude,
      lon: fix.longitude,
      accuracy: fix.accuracy,
      updatedAt: fix.timestampMs,
      source: fix.source,
      address: nextAddress,
    });
  })();
}

/** In-flight progressive fetch — a second caller subscribes instead of starting another (section 15). */
let deviceFetchInFlight: Promise<boolean> | null = null;

/** Accuracy good enough to skip a blocking accurate GPS pass (metres). */
const ACCEPTABLE_ACCURACY_M = 100;

/**
 * True when we already have a usable "current" pin from hydrate / fast fix /
 * recent reconcile — home should not wait on another getBestEffortPosition.
 */
function hasFreshUsableCurrentCoords(): boolean {
  const s = useLocationStore.getState();
  if (s.locationSource === "selected") return false;
  if (!s.coords) return false;
  if (s.locationFreshness !== "FRESH" && s.locationFreshness !== "RECENT") return false;
  if (s.coordsAccuracy != null && s.coordsAccuracy > ACCEPTABLE_ACCURACY_M) return false;
  return true;
}

function hasPaintableCurrentPin(): boolean {
  const s = useLocationStore.getState();
  if (s.locationSource === "selected") return false;
  return s.coords != null;
}

/** Phase-2 accurate refine — never awaited by progressiveDeviceFetch callers. */
function scheduleAccurateDeviceRefine(seq: number, t0: number): void {
  // Do not flip refining=true here — that kept "Updating location…" on after the
  // address already painted. Fast commit owns refining until reverse-geocode lands.
  void (async () => {
    try {
      const best = await getBestEffortPosition({
        log: logLocation,
        // Customer home only needs a usable refine — don't burn 9–14s on Highest polls.
        attemptTimeoutMs: 7_000,
        stableWaitMs: 5_000,
        maxAttempts: 2,
        acceptableAccuracyM: 45,
        repollGapMs: 400,
      });
      if (seq !== locationFetchSeq) return;
      logMetric("accurate_location_fix_ms", Date.now() - t0);
      const next: DeviceFix = {
        latitude: best.latitude,
        longitude: best.longitude,
        accuracy: best.accuracy,
        timestampMs: Date.now(),
        source: "accurate",
      };
      if (useLocationStore.getState().locationSource === "selected") {
        useLocationStore.setState({ refining: false });
        return;
      }
      if (shouldReplaceFix(currentDeviceFix(), next)) {
        commitDeviceFix(next, { refining: false });
      } else {
        useLocationStore.setState({ refining: false });
      }
    } catch {
      useLocationStore.setState({ refining: false });
    }
  })();
}

/**
 * Progressive device fetch (sections 4–5): FAST first fix → commit + async geocode →
 * ACCURATE refine in the background → replace only when materially better and not an
 * outlier. Returns true when any usable fix was committed. Deduplicated: concurrent
 * callers share the one in-flight run rather than each starting a fresh GPS session.
 *
 * Accurate GPS is never awaited here — callers (home fill, permission grant) unblock
 * as soon as a fast/cached pin is available.
 */
function progressiveDeviceFetch(): Promise<boolean> {
  if (deviceFetchInFlight) return deviceFetchInFlight;
  deviceFetchInFlight = runProgressiveDeviceFetch().finally(() => {
    deviceFetchInFlight = null;
  });
  return deviceFetchInFlight;
}

async function paintCachedDeviceLocationIfEmpty(): Promise<void> {
  const cur = useLocationStore.getState();
  if (cur.locationSource === "selected") return;
  if (cur.coords) return;
  let cached: PersistedDeviceLocation | null = null;
  try {
    cached = await loadLastKnownLocation();
  } catch {
    cached = null;
  }
  if (!cached) return;
  const next = useLocationStore.getState();
  if (next.locationSource === "selected" || next.coords) return;
  useLocationStore.setState({
    coords: { latitude: cached.lat, longitude: cached.lon },
    address: cached.address,
    coordsAccuracy: cached.accuracy,
    coordsUpdatedAt: cached.updatedAt,
    coordsSource: cached.source,
    locationFreshness: classifyFreshness(cached.updatedAt),
    locationSource: "current",
    refining: true,
    loading: false,
  });
}

async function runProgressiveDeviceFetch(): Promise<boolean> {
  const seq = ++locationFetchSeq;
  const t0 = Date.now();

  await paintCachedDeviceLocationIfEmpty();

  // Cached / hydrate pin is enough to unblock home — refine GPS in the background.
  if (hasPaintableCurrentPin() || hasFreshUsableCurrentCoords()) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[location] progressive_skip_fresh_current", {
        freshness: useLocationStore.getState().locationFreshness,
        accuracy: useLocationStore.getState().coordsAccuracy,
      });
    }
    scheduleAccurateDeviceRefine(seq, t0);
    useLocationStore.setState({ loading: false });
    logMetric("total_location_ready_ms", Date.now() - t0);
    return true;
  }

  let committedAny = false;

  // Phase 1 — fast, usable fix (OS last-known → raced Balanced/Low).
  try {
    const fast = await getFastPosition({
      log: logLocation,
      // Prefer a slightly older OS cache over waiting on GPS warm-up.
      lastKnownMaxAgeMs: 600_000,
      quickTimeoutMs: 2_000,
    });
    if (seq !== locationFetchSeq) return committedAny;
    logMetric(
      fast.source === "last-known" ? "last_known_location_ms" : "first_location_fix_ms",
      Date.now() - t0
    );
    commitDeviceFix(
      {
        latitude: fast.latitude,
        longitude: fast.longitude,
        accuracy: fast.accuracy,
        timestampMs: fast.timestampMs,
        source: fast.source,
      },
      { refining: true }
    );
    committedAny = true;
  } catch {
    // no fast fix — the accurate pass below may still succeed
  }

  // Phase 2 — accurate refine in background (does not block return).
  scheduleAccurateDeviceRefine(seq, t0);

  if (committedAny) {
    useLocationStore.setState({ loading: false });
    logMetric("total_location_ready_ms", Date.now() - t0);
  }
  return committedAny;
}

type LocationState = {
  permissionStatus: LocationPermissionStatus;
  loading: boolean;
  error: string | null;
  coords: { latitude: number; longitude: number } | null;
  address: ReverseGeocodeResult | null;
  /** Accuracy (m) of the current device coordinate, when known. */
  coordsAccuracy: number | null;
  /** ms epoch the current coordinate was captured (freshness + outlier checks). */
  coordsUpdatedAt: number | null;
  /** How the current coordinate was obtained (last-known / balanced / accurate / watch). */
  coordsSource: string | null;
  /** Freshness bucket for the current coordinate (FRESH / RECENT / STALE / UNKNOWN). */
  locationFreshness: LocationFreshness;
  /** True while a higher-accuracy fix is being acquired in the background (header hint). */
  refining: boolean;
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

const bootCachedLocation = peekLastKnownLocation();
if (bootCachedLocation?.address) {
  seedReverseGeocodeCache(bootCachedLocation.lon, bootCachedLocation.lat, bootCachedLocation.address);
}

export const useLocationStore = create<LocationState>((set, get) => ({
  permissionStatus: "undetermined",
  loading: false,
  error: null,
  coords: bootCachedLocation
    ? { latitude: bootCachedLocation.lat, longitude: bootCachedLocation.lon }
    : null,
  address: bootCachedLocation?.address ?? null,
  coordsAccuracy: bootCachedLocation?.accuracy ?? null,
  coordsUpdatedAt: bootCachedLocation?.updatedAt ?? null,
  coordsSource: bootCachedLocation?.source ?? null,
  locationFreshness: classifyFreshness(bootCachedLocation?.updatedAt),
  refining: false,
  locationSource: bootCachedLocation ? "current" : null,
  sessionSelectionKind: null,
  sessionBoundAddressId: null,
  locationHydrated: !!bootCachedLocation,
  showPermissionModal: false,
  locationSheetDismissedSession: false,

  hydrate: async () => {
    const already = get();
    if (
      already.locationHydrated &&
      already.coords &&
      !isPlaceholderAddress(already.address)
    ) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return;
    }
    // Clear any previously persisted *selected* pin so cold start cannot lock onto an old city.
    // Explicit selections are session-scoped; live GPS is the default for discovery.
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    // Paint the last real *device* location instantly (sections 2/7) so the home header
    // shows a location with no GPS wait. The cold-start reconcile + progressive fetch then
    // refine or replace it. This is a cache, never presented as a guaranteed-current fix.
    let cached: PersistedDeviceLocation | null = null;
    try {
      cached = await loadLastKnownLocation();
    } catch {
      cached = null;
    }
    if (cached?.address) {
      seedReverseGeocodeCache(cached.lon, cached.lat, cached.address);
    }
    const cur = get();
    const canApplyCache = cached != null && cur.locationSource !== "selected";
    const fillMissingAddress =
      canApplyCache && cached && isPlaceholderAddress(cur.address) && !isPlaceholderAddress(cached.address);
    const fillMissingCoords = canApplyCache && cached && cur.coords == null;
    set({
      locationHydrated: true,
      sessionSelectionKind: null,
      sessionBoundAddressId: null,
      ...(fillMissingCoords && cached
        ? {
            coords: { latitude: cached.lat, longitude: cached.lon },
            address: cached.address,
            coordsAccuracy: cached.accuracy,
            coordsUpdatedAt: cached.updatedAt,
            coordsSource: cached.source,
            locationFreshness: classifyFreshness(cached.updatedAt),
            locationSource: "current",
          }
        : fillMissingAddress && cached
          ? { address: cached.address, locationSource: cur.locationSource ?? "current" }
          : cur.coords
            ? { locationSource: cur.locationSource ?? "current" }
            : {}),
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
    // An explicit address set (user pick or reconcile pin) supersedes any in-flight
    // progressive GPS fetch — bump the token so its background phases abort and never
    // overwrite this newer, intentional choice.
    locationFetchSeq++;
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
      // Last-known / hydrate already painted — don't block the header on a
      // native permission round-trip; refine GPS in the background.
      if (get().coords && get().locationSource === "current") {
        set({ loading: false });
        void progressiveDeviceFetch();
        return;
      }
      const permT0 = Date.now();
      const readiness = await getDeviceLocationReadiness();
      logMetric("location_permission_ms", Date.now() - permT0);
      if (readiness.isReady) {
        set({ permissionStatus: "granted", showPermissionModal: false });
        // Fast first fix → instant coords + async address → background accuracy refine.
        const ok = await progressiveDeviceFetch();
        if (!ok) set({ loading: false });
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
      const ok = await progressiveDeviceFetch();
      if (!ok) set({ loading: false, error: "Location error" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({ error: message, loading: false, refining: false });
    }
  },
}));
