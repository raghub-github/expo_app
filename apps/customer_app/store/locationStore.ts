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
  acquireProgressivePosition,
  coordsMovedSignificantly,
  getDeviceLocationReadiness,
  withTimeout,
  type LocationPermissionStatus,
  type DeviceLocationReadiness,
  type ProgressiveFix,
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
import { metresBetween, pinStillHolds, shouldReplaceFix } from "@/lib/locationFixSelection";
import { startupLaunchLog } from "@/lib/startupPerf";

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

/** Mapbox reverse-geocode budget — too short → placeholder "Current location" forever. */
const GEOCODE_MS = 8_000;
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
 * Monotonic token for live-GPS commits: an explicit address pick bumps it, so a fix still
 * arriving from an in-flight GPS session can never overwrite that intentional choice.
 */
let locationFetchSeq = 0;

/** Per-geocode token: only the newest coordinate's async geocode is applied. */
let addressCommitSeq = 0;

/** Where the visible address was resolved. The label only describes coords near this. */
let addressAnchor: { latitude: number; longitude: number } | null = null;

/** Dev-only performance metrics: app-action → each location milestone (section 26). */
type LocationMetric =
  | "location_permission_ms"
  | "last_known_location_ms"
  | "first_location_fix_ms"
  | "accurate_location_fix_ms"
  | "reverse_geocode_ms"
  | "total_location_ready_ms";

function logMetric(metric: LocationMetric, ms: number): void {
  if (!LOCATION_DEBUG && !__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[location:perf] ${metric} = ${Math.round(ms)}ms`);
  if (__DEV__) {
    try {
      const { startupMeasure, startupInc } = require("@/lib/startupPerf") as typeof import("@/lib/startupPerf");
      if (metric === "last_known_location_ms" || metric === "first_location_fix_ms") {
        startupInc("gps_requests");
        startupMeasure(metric, "process_start");
      } else if (metric === "reverse_geocode_ms") {
        startupMeasure("address_resolved", "process_start");
      } else if (metric === "total_location_ready_ms") {
        startupMeasure("cached_or_fresh_location_ready", "process_start");
      }
    } catch {
      // ignore circular/dev load issues
    }
  }
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

export function isPlaceholderAddress(address: ReverseGeocodeResult | null | undefined): boolean {
  if (!address) return true;
  const primary = (address.primary ?? "").trim().toLowerCase();
  return (
    (primary === "" || primary === "current location" || primary === DETECTING_ADDRESS.toLowerCase()) &&
    !address.city &&
    !address.state &&
    !address.pincode
  );
}

const DETECTING_ADDRESS = "Detecting address…";
/** Below this the visible label still describes the point: no new geocode needed. */
const ADDRESS_VALID_M = 25;
/** Second chance for a failed geocode: mobile networks often recover within seconds. */
const GEOCODE_RETRY_MS = 2_500;

function namedPlaceholder(primary: string): ReverseGeocodeResult {
  return { primary, secondary: "", fullAddress: primary, city: null, state: null, pincode: null };
}

/** Metres from `point` to where the visible address was resolved; Infinity when unknown. */
export function distanceFromAddressAnchorM(point: { latitude: number; longitude: number }): number {
  if (!addressAnchor) return Number.POSITIVE_INFINITY;
  return metresBetween(
    addressAnchor.latitude,
    addressAnchor.longitude,
    point.latitude,
    point.longitude
  );
}

/** For code outside the store that has just written a resolved address for this point. */
export function noteAddressResolvedAt(point: { latitude: number; longitude: number }): void {
  addressAnchor = { latitude: point.latitude, longitude: point.longitude };
}

/**
 * Resolve the address for a device coordinate and apply it, unless a newer coordinate or
 * an explicit pick has superseded it. Retries once. When it still fails, a label from a
 * different place is dropped rather than left describing where the user no longer is.
 */
export function resolveDeviceAddress(point: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestampMs?: number;
  source?: PersistedDeviceLocation["source"];
}): void {
  const token = ++addressCommitSeq;
  const startedAt = Date.now();
  startupLaunchLog("REVERSE_GEOCODE_START");
  const superseded = () =>
    token !== addressCommitSeq || useLocationStore.getState().locationSource === "selected";

  void (async () => {
    let address = await geocodeOrFallback(point.longitude, point.latitude);
    if (superseded()) return;
    if (isPlaceholderAddress(address)) {
      await new Promise((resolve) => setTimeout(resolve, GEOCODE_RETRY_MS));
      if (superseded()) return;
      address = await geocodeOrFallback(point.longitude, point.latitude);
      if (superseded()) return;
    }
    logMetric("reverse_geocode_ms", Date.now() - startedAt);

    if (isPlaceholderAddress(address)) {
      const visible = useLocationStore.getState().address;
      const visibleStillTrue =
        !isPlaceholderAddress(visible) && distanceFromAddressAnchorM(point) < LABEL_STILL_NEARBY_M;
      useLocationStore.setState({
        address: visibleStillTrue ? visible : namedPlaceholder("Current location"),
        refining: false,
      });
      return;
    }

    addressAnchor = { latitude: point.latitude, longitude: point.longitude };
    useLocationStore.setState({ address, refining: false, detectingTimedOut: false });
    startupLaunchLog("REVERSE_GEOCODE_DONE", {
      durationMs: Date.now() - startedAt,
      hasPrimary: Boolean(address.primary),
    });
    saveLastKnownLocation({
      lat: point.latitude,
      lon: point.longitude,
      accuracy: point.accuracy ?? useLocationStore.getState().coordsAccuracy,
      updatedAt: point.timestampMs ?? Date.now(),
      source: point.source ?? "accurate",
      address,
    });
  })();
}

/** A failed geocode keeps the old label only if the user is still roughly in that place. */
const LABEL_STILL_NEARBY_M = 300;

/**
 * Commit device coordinates immediately: the coordinate is live before its address is
 * known, so listings react at once. The address follows asynchronously, and only when the
 * user has actually moved away from where the current label was resolved.
 */
function commitDeviceFix(fix: DeviceFix): void {
  const prev = useLocationStore.getState();
  const wasSelected = prev.locationSource === "selected";
  if (wasSelected) addressAnchor = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {}); // drop any stale selected pin

  const labelIsReal = !wasSelected && !isPlaceholderAddress(prev.address);
  // Same object when the pin holds: zustand subscribers and coordinate-keyed queries see
  // no change, and only the accuracy and age below are updated.
  const heldPin = !wasSelected && prev.coords && pinStillHolds(prev.coords, fix) ? prev.coords : null;
  const needsGeocode =
    !labelIsReal || (heldPin == null && distanceFromAddressAnchorM(fix) >= ADDRESS_VALID_M);

  useLocationStore.setState({
    coords: heldPin ?? { latitude: fix.latitude, longitude: fix.longitude },
    coordsAccuracy: fix.accuracy,
    coordsUpdatedAt: fix.timestampMs,
    coordsSource: fix.source,
    locationFreshness: classifyFreshness(fix.timestampMs),
    locationSource: "current",
    sessionSelectionKind: null,
    sessionBoundAddressId: null,
    loading: false,
    refining: needsGeocode,
    detectingTimedOut: false,
    error: null,
    // Keep the last real label on screen while the geocode runs: never flash a spinner
    // over a usable address. A saved-address label ("Home") is never reused for GPS.
    address: labelIsReal ? prev.address : namedPlaceholder(DETECTING_ADDRESS),
  });

  // Persist the label only when it really describes this point, so the next cold start
  // cannot paint (or seed the geocode cache with) an address from somewhere else.
  saveLastKnownLocation({
    lat: fix.latitude,
    lon: fix.longitude,
    accuracy: fix.accuracy,
    updatedAt: fix.timestampMs,
    source: fix.source,
    address: needsGeocode ? null : prev.address,
  });

  if (needsGeocode) resolveDeviceAddress(fix);
}

/** Accuracy good enough that a fix under 2 minutes old needs no new GPS session (metres). */
const ACCEPTABLE_ACCURACY_M = 100;

/** How long a caller with nothing on screen waits for the first fix. */
const FIRST_FIX_WAIT_MS = 6_000;

/** A fix this sharp may drive decisions like un-binding a saved address (metres). */
const TRUSTED_FIX_ACCURACY_M = 200;

/**
 * True when the store already has a just-acquired, sharp "current" pin, so a new GPS
 * session would learn nothing (e.g. tab switches, a quick resume).
 */
function hasFreshUsableCurrentCoords(): boolean {
  const s = useLocationStore.getState();
  if (s.locationSource === "selected") return false;
  if (!s.coords) return false;
  if (classifyFreshness(s.coordsUpdatedAt) !== "FRESH") return false;
  if (s.coordsAccuracy != null && s.coordsAccuracy > ACCEPTABLE_ACCURACY_M) return false;
  return true;
}

function toDeviceFix(fix: ProgressiveFix): DeviceFix {
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    // iOS reports fractional ms; the backend's capturedAtMs only accepts an integer.
    timestampMs: Math.round(fix.timestampMs),
    source: fix.source === "gps" ? "accurate" : fix.source,
  };
}

function commitIfBetter(fix: DeviceFix): void {
  const s = useLocationStore.getState();
  // A saved/searched pin is not a device fix: comparing against it (or its timestamp)
  // would reject the user's real position as an impossible jump.
  if (s.locationSource !== "selected") {
    const current = currentDeviceFix();
    // An older reading than the one held. (Not if that one is dated in the future: a clock
    // change must not freeze the pin.)
    if (current && fix.timestampMs < current.timestampMs && current.timestampMs <= Date.now()) return;
    if (!shouldReplaceFix(current, fix)) return;
  }
  commitDeviceFix(fix);
}

type DeviceAcquisition = {
  firstFix: Promise<DeviceFix | null>;
  done: Promise<DeviceFix | null>;
  /** First fix accurate enough to decide on; null if the session ends without one. */
  trusted: Promise<DeviceFix | null>;
  best: () => DeviceFix | null;
  /** Commits apply only while this matches locationFetchSeq. */
  commitSeq: number;
  /** May replace a selected pin: the user asked for "current location". */
  force: boolean;
};

let activeAcquisition: DeviceAcquisition | null = null;
let lastAcquisition: DeviceAcquisition | null = null;

/**
 * Start the one GPS session, or join the running one. App open fires several callers
 * (bootstrap, reconcile, home, the permission host); they all share a single session
 * rather than each holding the GPS.
 */
function startDeviceAcquisition(force: boolean): DeviceAcquisition {
  if (activeAcquisition) {
    activeAcquisition.commitSeq = ++locationFetchSeq;
    activeAcquisition.force = activeAcquisition.force || force;
    return activeAcquisition;
  }
  const t0 = Date.now();
  let sawFirst = false;
  let resolveTrusted!: (fix: DeviceFix | null) => void;
  const trusted = new Promise<DeviceFix | null>((resolve) => (resolveTrusted = resolve));
  const session = acquireProgressivePosition({
    log: logLocation,
    onFix: (raw) => {
      const fix = toDeviceFix(raw);
      if (fix.accuracy != null && fix.accuracy <= TRUSTED_FIX_ACCURACY_M) resolveTrusted(fix);
      if (!sawFirst) {
        sawFirst = true;
        logMetric(
          raw.source === "last-known" ? "last_known_location_ms" : "first_location_fix_ms",
          Date.now() - t0
        );
      }
      const owner = acquisition;
      if (owner.commitSeq !== locationFetchSeq) return;
      if (useLocationStore.getState().locationSource === "selected" && !owner.force) return;
      commitIfBetter(fix);
    },
  });
  const acquisition: DeviceAcquisition = {
    firstFix: session.firstFix.then((fix) => (fix ? toDeviceFix(fix) : null)),
    trusted,
    best: () => {
      const fix = session.best();
      return fix ? toDeviceFix(fix) : null;
    },
    done: session.done.then((fix) => {
      if (activeAcquisition === acquisition) activeAcquisition = null;
      resolveTrusted(null);
      logMetric("accurate_location_fix_ms", Date.now() - t0);
      return fix ? toDeviceFix(fix) : null;
    }),
    commitSeq: ++locationFetchSeq,
    force,
  };
  activeAcquisition = acquisition;
  lastAcquisition = acquisition;
  return acquisition;
}

/**
 * A live device fix for a caller that must not act on a stale coordinate: the store's
 * own fix when it is just-acquired, otherwise the first fix of the shared GPS session,
 * bounded by `timeoutMs`. Null when nothing arrives in time.
 */
export async function awaitLiveDeviceFix(timeoutMs: number): Promise<DeviceFix | null> {
  if (hasFreshUsableCurrentCoords()) return currentDeviceFix();
  const { firstFix } = startDeviceAcquisition(false);
  return withTimeout(firstFix, timeoutMs).catch(() => null);
}

/**
 * Like awaitLiveDeviceFix, for decisions a rough fix could get wrong: waits for a fix
 * within TRUSTED_FIX_ACCURACY_M, and at the deadline returns the best fix so far (which
 * may be coarse: check with fixIsConclusive).
 */
export async function awaitTrustedDeviceFix(timeoutMs: number): Promise<DeviceFix | null> {
  if (hasFreshUsableCurrentCoords()) return currentDeviceFix();
  const acquisition = startDeviceAcquisition(false);
  const trusted = await withTimeout(acquisition.trusted, timeoutMs).catch(() => null);
  return trusted ?? acquisition.best();
}

/**
 * Can this fix be believed over `reference`? A sharp one can. A coarse one (a cell tower
 * can be kilometres out) only if it lands outside its own error radius of the reference:
 * inside it, the fix is no evidence the user has gone anywhere.
 */
export function fixIsConclusive(
  fix: { latitude: number; longitude: number; accuracy: number | null },
  reference: { latitude: number; longitude: number }
): boolean {
  if (fix.accuracy != null && fix.accuracy <= TRUSTED_FIX_ACCURACY_M) return true;
  const moved = metresBetween(reference.latitude, reference.longitude, fix.latitude, fix.longitude);
  return moved > (fix.accuracy ?? TRUSTED_FIX_ACCURACY_M);
}

/** The best fix of the latest GPS session, once that session has ended. */
export function awaitFinalDeviceFix(): Promise<DeviceFix | null> {
  return lastAcquisition?.done ?? Promise.resolve(null);
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
  if (!isPlaceholderAddress(cached.address)) {
    addressAnchor = { latitude: cached.lat, longitude: cached.lon };
  }
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

/**
 * Show what we know instantly, and always go and check. The cached pin is only a
 * placeholder: yesterday's address must not stand in for today's position.
 *
 * - Fix under 2 min old and sharp: nothing to do.
 * - Anything on screen (cache): unblock the caller now, the session updates it in place.
 * - Nothing on screen: the caller waits for the first fix, up to FIRST_FIX_WAIT_MS.
 *
 * Returns true when a usable pin is available.
 */
async function progressiveDeviceFetch(force = false): Promise<boolean> {
  const t0 = Date.now();
  await paintCachedDeviceLocationIfEmpty();

  // A pin with no address (last session died before its geocode, or the network failed)
  // gets one now. A new fix may never come, if the user has not moved.
  const shown = useLocationStore.getState();
  if (shown.coords && shown.locationSource === "current" && isPlaceholderAddress(shown.address)) {
    resolveDeviceAddress(shown.coords);
  }

  if (hasFreshUsableCurrentCoords()) {
    useLocationStore.setState({ loading: false, refining: false });
    return true;
  }

  const acquisition = startDeviceAcquisition(force);
  const pinOnScreen = () => {
    const s = useLocationStore.getState();
    return s.locationSource !== "selected" && s.coords != null;
  };

  if (!pinOnScreen()) {
    await withTimeout(acquisition.firstFix, FIRST_FIX_WAIT_MS).catch(() => null);
  }
  const ok = pinOnScreen();
  if (ok) {
    useLocationStore.setState({ loading: false });
    logMetric("total_location_ready_ms", Date.now() - t0);
  }
  void acquisition.done.then(() => {
    const s = useLocationStore.getState();
    if (s.refining && !isPlaceholderAddress(s.address)) {
      useLocationStore.setState({ refining: false });
    }
    // The GPS has given up with nothing to show: offer the user a way forward.
    if (!s.coords) useLocationStore.setState({ detectingTimedOut: true, loading: false });
  });
  return ok;
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
  /** True after detecting watchdog — stop endless "Detecting location…". */
  detectingTimedOut: boolean;
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
  if (!isPlaceholderAddress(bootCachedLocation.address)) {
    addressAnchor = { latitude: bootCachedLocation.lat, longitude: bootCachedLocation.lon };
  }
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
  detectingTimedOut: false,

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
      if (!addressAnchor && !isPlaceholderAddress(cached.address)) {
        addressAnchor = { latitude: cached.lat, longitude: cached.lon };
      }
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
      detectingTimedOut: false,
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
    // A selected pin supersedes any in-flight GPS session: bump the token so its later
    // fixes can never overwrite this intentional choice. A "current" write is the same
    // live pin, and must not stop the session from sharpening it.
    if (source === "selected") {
      locationFetchSeq++;
      addressAnchor = null;
      // An earlier "use current location" no longer speaks for the user.
      if (activeAcquisition) activeAcquisition.force = false;
    }
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
        void progressiveDeviceFetch(forceDevice);
        return;
      }
      const permT0 = Date.now();
      const readiness = await getDeviceLocationReadiness();
      logMetric("location_permission_ms", Date.now() - permT0);
      if (readiness.isReady) {
        set({ permissionStatus: "granted", showPermissionModal: false });
        // First fix → instant coords + async address → the session keeps sharpening it.
        const ok = await progressiveDeviceFetch(forceDevice);
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
      const ok = await progressiveDeviceFetch(forceDevice);
      if (!ok) set({ loading: false, error: "Location error" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({ error: message, loading: false, refining: false });
    }
  },
}));
