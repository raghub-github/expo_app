import * as Location from "expo-location";
import type { LocationFix } from "./types";

export type LocationTrackerState =
  | { status: "idle" }
  | { status: "permission_denied" }
  | { status: "services_disabled" }
  | { status: "tracking"; lastFix?: LocationFix };

export type LocationTracker = {
  getState: () => LocationTrackerState;
  subscribe: (fn: (s: LocationTrackerState) => void) => () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export type LocationEngineProfile = {
  timeIntervalMs: number;
  distanceIntervalM: number;
  minAccuracyM: number;
  accuracy: Location.LocationAccuracy;
};

const DEFAULT_PROFILE: LocationEngineProfile = {
  timeIntervalMs: 2000,
  distanceIntervalM: 5,
  minAccuracyM: 150,
  accuracy: Location.Accuracy.Highest,
};

const NAV_PROFILE: LocationEngineProfile = {
  timeIntervalMs: 800,
  distanceIntervalM: 2,
  minAccuracyM: 80,
  accuracy: Location.Accuracy.Highest,
};

const ACTIVE_ORDER_BG_PROFILE: LocationEngineProfile = {
  timeIntervalMs: 5000,
  distanceIntervalM: 8,
  minAccuracyM: 120,
  accuracy: Location.Accuracy.High,
};

const DUTY_IDLE_BG_PROFILE: LocationEngineProfile = {
  timeIntervalMs: 15000,
  distanceIntervalM: 25,
  minAccuracyM: 150,
  accuracy: Location.Accuracy.Balanced,
};

function normalizeFix(loc: Location.LocationObject): LocationFix {
  const c = loc.coords;
  return {
    tsMs: loc.timestamp,
    lat: c.latitude,
    lng: c.longitude,
    accuracyM: c.accuracy ?? undefined,
    altitudeM: c.altitude ?? undefined,
    speedMps: c.speed ?? undefined,
    headingDeg: c.heading ?? undefined,
    mocked: (loc as { mocked?: boolean }).mocked ?? undefined,
    provider: "unknown",
  };
}

function mergeProfiles(profiles: LocationEngineProfile[]): LocationEngineProfile {
  if (profiles.length === 0) return DEFAULT_PROFILE;
  return {
    timeIntervalMs: Math.min(...profiles.map((p) => p.timeIntervalMs)),
    distanceIntervalM: Math.min(...profiles.map((p) => p.distanceIntervalM)),
    minAccuracyM: Math.min(...profiles.map((p) => p.minAccuracyM)),
    accuracy: profiles.some((p) => p.accuracy === Location.Accuracy.Highest)
      ? Location.Accuracy.Highest
      : profiles.some((p) => p.accuracy === Location.Accuracy.High)
        ? Location.Accuracy.High
        : Location.Accuracy.Balanced,
  };
}

/**
 * Single source of truth for rider GPS in the foreground.
 * Multiple consumers (duty ping, home map, navigation) share one watchPositionAsync.
 */
class SharedLocationEngine {
  private state: LocationTrackerState = { status: "idle" };
  private listeners = new Set<(s: LocationTrackerState) => void>();
  private profiles = new Map<string, LocationEngineProfile>();
  private sub: Location.LocationSubscription | null = null;
  private restarting = false;
  private activeOptsKey = "";

  getState(): LocationTrackerState {
    return this.state;
  }

  /** Inject a fix from the background location task (or one-shot refresh). */
  ingestExternalFix(fix: LocationFix): void {
    if (this.state.status === "permission_denied" || this.state.status === "services_disabled") {
      return;
    }
    this.emit({ status: "tracking", lastFix: fix });
  }

  subscribe(fn: (s: LocationTrackerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  async acquire(profileId: string, profile?: Partial<LocationEngineProfile>): Promise<void> {
    const next: LocationEngineProfile = {
      ...DEFAULT_PROFILE,
      ...profile,
    };
    this.profiles.set(profileId, next);
    await this.reconcileWatch();
  }

  async release(profileId: string): Promise<void> {
    this.profiles.delete(profileId);
    await this.reconcileWatch();
  }

  private emit(s: LocationTrackerState) {
    this.state = s;
    for (const fn of this.listeners) {
      try {
        fn(s);
      } catch {
        /* never break the bus */
      }
    }
  }

  private currentFix(): LocationFix | undefined {
    return this.state.status === "tracking" ? this.state.lastFix : undefined;
  }

  private shouldAcceptFix(fix: LocationFix, minAccuracyM: number): boolean {
    const prev = this.currentFix();
    if (!prev) return true;
    if (fix.accuracyM == null) return true;
    if (fix.accuracyM <= minAccuracyM) return true;
    return false;
  }

  private async reconcileWatch(): Promise<void> {
    if (this.profiles.size === 0) {
      await this.stopWatch();
      this.emit({ status: "idle" });
      return;
    }

    const merged = mergeProfiles([...this.profiles.values()]);
    const optsKey = `${merged.timeIntervalMs}:${merged.distanceIntervalM}:${merged.accuracy}:${merged.minAccuracyM}`;

    if (this.sub && this.activeOptsKey === optsKey) {
      if (this.state.status !== "tracking") {
        this.emit({ status: "tracking", lastFix: this.currentFix() });
      }
      return;
    }

    await this.startWatch(merged, optsKey);
  }

  private async startWatch(merged: LocationEngineProfile, optsKey: string): Promise<void> {
    if (this.restarting) return;
    this.restarting = true;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        this.emit({ status: "permission_denied" });
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        this.emit({ status: "services_disabled" });
        return;
      }

      await this.stopWatch();
      // Keep any existing fix while restarting so UI never blanks.
      this.emit({ status: "tracking", lastFix: this.currentFix() });
      this.activeOptsKey = optsKey;

      // Instant seed: OS last-known first (do not wait on cold GPS).
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 1000,
        });
        if (lastKnown) {
          this.emit({ status: "tracking", lastFix: normalizeFix(lastKnown) });
        }
      } catch {
        /* continue */
      }

      // Start watch immediately — don't block UI on getCurrentPositionAsync.
      this.sub = await Location.watchPositionAsync(
        {
          accuracy: merged.accuracy,
          timeInterval: merged.timeIntervalMs,
          distanceInterval: merged.distanceIntervalM,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          const fix = normalizeFix(loc);
          if (!this.shouldAcceptFix(fix, merged.minAccuracyM)) {
            this.emit({ status: "tracking", lastFix: this.currentFix() });
            return;
          }
          this.emit({ status: "tracking", lastFix: fix });
        }
      );

      // Refine in background (Balanced is fast enough for home map).
      void (async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const fix = normalizeFix(loc);
          // Always accept refinement when we have no fix yet; otherwise respect accuracy gate.
          if (!this.currentFix() || this.shouldAcceptFix(fix, merged.minAccuracyM)) {
            this.emit({ status: "tracking", lastFix: fix });
          }
        } catch {
          /* watch continues */
        }
      })();
    } finally {
      this.restarting = false;
    }
  }

  private async stopWatch(): Promise<void> {
    if (this.sub) {
      this.sub.remove();
      this.sub = null;
    }
    this.activeOptsKey = "";
  }
}

let sharedEngine: SharedLocationEngine | null = null;

export function getSharedLocationEngine(): SharedLocationEngine {
  if (!sharedEngine) sharedEngine = new SharedLocationEngine();
  return sharedEngine;
}

export const LOCATION_ENGINE_PROFILES = {
  default: DEFAULT_PROFILE,
  nav: NAV_PROFILE,
  activeOrderBg: ACTIVE_ORDER_BG_PROFILE,
  dutyIdleBg: DUTY_IDLE_BG_PROFILE,
} as const;

let fgSeq = 0;

/**
 * Back-compat tracker API backed by the shared engine (one device watch).
 */
export function createSharedForegroundLocationTracker(opts?: {
  timeIntervalMs?: number;
  distanceIntervalM?: number;
  minAccuracyM?: number;
  accuracy?: Location.LocationAccuracy;
  profileId?: string;
}): LocationTracker {
  const engine = getSharedLocationEngine();
  const profileId = opts?.profileId ?? `fg_${++fgSeq}`;
  const profile: Partial<LocationEngineProfile> = {
    timeIntervalMs: opts?.timeIntervalMs,
    distanceIntervalM: opts?.distanceIntervalM,
    minAccuracyM: opts?.minAccuracyM,
    accuracy: opts?.accuracy,
  };

  return {
    getState: () => engine.getState(),
    subscribe: (fn) => engine.subscribe(fn),
    start: async () => {
      await engine.acquire(profileId, profile);
    },
    stop: async () => {
      await engine.release(profileId);
    },
  };
}
