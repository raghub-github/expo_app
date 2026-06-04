import * as Location from "expo-location";
import type { RiderLocationFix } from "./types";

export type LocationTrackerState =
  | { status: "idle" }
  | { status: "permission_denied" }
  | { status: "services_disabled" }
  | { status: "tracking"; lastFix?: RiderLocationFix };

export type LocationTracker = {
  getState: () => LocationTrackerState;
  subscribe: (fn: (s: LocationTrackerState) => void) => () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

function normalizeFix(loc: Location.LocationObject): RiderLocationFix {
  const c = loc.coords;
  return {
    tsMs: loc.timestamp,
    lat: c.latitude,
    lng: c.longitude,
    accuracyM: c.accuracy ?? undefined,
    altitudeM: c.altitude ?? undefined,
    speedMps: c.speed ?? undefined,
    headingDeg: c.heading ?? undefined,
    mocked: (loc as any).mocked ?? undefined,
    provider: "unknown",
  };
}

export function createForegroundLocationTracker(opts?: {
  timeIntervalMs?: number;
  distanceIntervalM?: number;
  minAccuracyM?: number;
}): LocationTracker {
  const timeIntervalMs = opts?.timeIntervalMs ?? 2000;
  const distanceIntervalM = opts?.distanceIntervalM ?? 5;
  const minAccuracyM = opts?.minAccuracyM ?? 150;

  let state: LocationTrackerState = { status: "idle" };
  const listeners = new Set<(s: LocationTrackerState) => void>();
  let sub: Location.LocationSubscription | null = null;

  const currentFix = (): RiderLocationFix | undefined =>
    state.status === "tracking" ? state.lastFix : undefined;

  const shouldAcceptFix = (fix: RiderLocationFix): boolean => {
    const prev = currentFix();
    if (!prev) return true;
    if (fix.accuracyM == null) return true;
    if (fix.accuracyM <= minAccuracyM) return true;
    return false;
  };

  const emit = (s: LocationTrackerState) => {
    state = s;
    for (const fn of listeners) fn(state);
  };

  const start = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      emit({ status: "permission_denied" });
      return;
    }

    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      emit({ status: "services_disabled" });
      return;
    }

    if (sub) return;
    emit({ status: "tracking" });

    // Get initial location immediately for faster map loading
    try {
      let initialLoc: Location.LocationObject | null = null;
      try {
        initialLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          maximumAge: 60_000,
        });
      } catch {
        initialLoc = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
      }
      if (initialLoc) {
        emit({ status: "tracking", lastFix: normalizeFix(initialLoc) });
      }
    } catch (error) {
      console.warn("[LocationTracker] Failed to get initial location:", error);
    }

    // Start continuous tracking with high accuracy
    sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: timeIntervalMs,
        distanceInterval: distanceIntervalM,
        mayShowUserSettingsDialog: true,
      },
      (loc) => {
        const fix = normalizeFix(loc);
        if (!shouldAcceptFix(fix)) {
          emit({ status: "tracking", lastFix: currentFix() });
          return;
        }
        emit({ status: "tracking", lastFix: fix });
      },
    );
  };

  const stop = async () => {
    if (sub) {
      sub.remove();
      sub = null;
    }
    emit({ status: "idle" });
  };

  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    start,
    stop,
  };
}


