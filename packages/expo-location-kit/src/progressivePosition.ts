import * as Location from "expo-location";
import { validateCoords, withTimeout } from "./coords";
import type {
  ProgressiveAcquisition,
  ProgressiveFix,
  ProgressivePositionOptions,
} from "./types";

const DEFAULTS = {
  /** A fix this good ends the session straight away. */
  goalAccuracyM: 35,
  /** A fix this good ends the session once it has stopped improving for settleMs. */
  settleAccuracyM: 120,
  /** Accept a usable fix quickly — fresh address target is ≤5–7s total. */
  settleMs: 1_200,
  /** Hard ceiling on GPS use — never hold the radio for minutes indoors. */
  budgetMs: 6_500,
  /** OS last-known window — instant paint, never labeled as a live GPS fix. */
  lastKnownMaxAgeMs: 120_000,
} as const;

/** Per-accuracy one-shot ceilings — Android can hang forever without these. */
const ONE_SHOT_TIMEOUT_MS: Record<string, number> = {
  low: 2_000,
  balanced: 3_500,
};

/** Metres of possible travel charged per second of fix age (18 km/h). */
const AGE_PENALTY_M_PER_S = 5;
/** An accuracy gain below this is noise, not worth another commit + geocode. */
const MIN_IMPROVEMENT_M = 3;
/** Score for a fix that reports no accuracy — better than nothing, worse than any radius. */
const UNKNOWN_ACCURACY_M = 10_000;

/**
 * Accuracy radius charged for how old the fix is. An OS cached fix claiming 10 m from
 * two minutes ago is not a 10 m fix any more — the user may have moved since.
 */
export function effectiveAccuracyM(
  fix: Pick<ProgressiveFix, "accuracy" | "timestampMs">,
  now: number
): number {
  const ageS = Math.max(0, now - fix.timestampMs) / 1000;
  return (fix.accuracy ?? UNKNOWN_ACCURACY_M) + ageS * AGE_PENALTY_M_PER_S;
}

/**
 * STREAMING first-fix-then-improve acquisition: the customer-facing replacement for
 * "get a fast fix, then separately poll for an accurate one".
 *
 * The polled approach had two costs. Quick one-shots that missed their timeout were
 * thrown away even if they landed a moment later, and the accurate phase opened a
 * second GPS session that could run for ~20 s. Here one session runs every source
 * side by side, so nothing that arrives is wasted:
 *
 *   OS last-known (instant) + Low + Balanced one-shots + a High-accuracy watch
 *
 * `onFix` fires for the first fix and for each material improvement. The session
 * ends itself on a goal-quality fix, on a good fix that has stopped improving, or
 * at the budget, so it can never hold the GPS open.
 *
 * Never shows the Android "improve accuracy" dialog (mayShowUserSettingsDialog:
 * false) — this runs in the background on app open and must not interrupt anyone.
 *
 * NOTE: additive. `getBestEffortPosition` stays as it is for the Rider app.
 */
export function acquireProgressivePosition(
  options?: ProgressivePositionOptions
): ProgressiveAcquisition {
  const goalAccuracyM = options?.goalAccuracyM ?? DEFAULTS.goalAccuracyM;
  const settleAccuracyM = options?.settleAccuracyM ?? DEFAULTS.settleAccuracyM;
  const settleMs = options?.settleMs ?? DEFAULTS.settleMs;
  const budgetMs = options?.budgetMs ?? DEFAULTS.budgetMs;
  const lastKnownMaxAgeMs = options?.lastKnownMaxAgeMs ?? DEFAULTS.lastKnownMaxAgeMs;
  const log = options?.log;

  let best: ProgressiveFix | null = null;
  let finished = false;
  let subscription: { remove: () => void } | null = null;
  let budgetTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Live sources still able to produce a fix (one-shots + the watch). */
  let liveSourcesPending = 0;

  let resolveFirst!: (fix: ProgressiveFix | null) => void;
  let resolveDone!: (fix: ProgressiveFix | null) => void;
  const firstFix = new Promise<ProgressiveFix | null>((r) => (resolveFirst = r));
  const done = new Promise<ProgressiveFix | null>((r) => (resolveDone = r));

  const finish = () => {
    if (finished) return;
    finished = true;
    if (budgetTimer) clearTimeout(budgetTimer);
    if (settleTimer) clearTimeout(settleTimer);
    try {
      subscription?.remove();
    } catch {
      // already gone
    }
    subscription = null;
    resolveFirst(best);
    resolveDone(best);
  };

  const consider = (
    loc: Location.LocationObject | null | undefined,
    source: ProgressiveFix["source"]
  ) => {
    if (finished) return;
    const v = validateCoords(loc);
    if (!v) return;
    const now = Date.now();
    const fix: ProgressiveFix = {
      ...v,
      source,
      timestampMs: typeof loc?.timestamp === "number" ? loc.timestamp : now,
    };
    const score = effectiveAccuracyM(fix, now);
    if (best && score > effectiveAccuracyM(best, now) - MIN_IMPROVEMENT_M) return;

    best = fix;
    log?.("progressive-fix", {
      source,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracyM: fix.accuracy,
      ageMs: now - fix.timestampMs,
    });
    resolveFirst(fix);
    try {
      options?.onFix?.(fix);
    } catch {
      // a failing consumer must not end the acquisition
    }

    if (score <= goalAccuracyM) {
      finish();
      return;
    }
    if (score <= settleAccuracyM) {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, settleMs);
    }
  };

  const liveSourceEnded = () => {
    liveSourcesPending -= 1;
    // Nothing left to wait for (no permission, location off): do not sit out the budget.
    if (liveSourcesPending <= 0 && !settleTimer) finish();
  };

  budgetTimer = setTimeout(finish, budgetMs);

  void withTimeout(Location.getLastKnownPositionAsync({ maxAge: lastKnownMaxAgeMs }), 250)
    .then((loc) => consider(loc, "last-known"))
    .catch(() => {
      // no cached fix — the live sources below cover it
    });

  // Coarse one-shots — network/Wi-Fi first. Each has a hard timeout so a stuck
  // Android provider cannot delay the fresh-address path for minutes.
  const oneShots: Array<[Location.Accuracy, ProgressiveFix["source"]]> = [
    [Location.Accuracy.Lowest, "low"],
    [Location.Accuracy.Low, "low"],
    [Location.Accuracy.Balanced, "balanced"],
  ];
  // The watch only ends a pending count if it fails to start; once running it is live.
  liveSourcesPending = oneShots.length + 1;
  for (const [accuracy, source] of oneShots) {
    const timeoutMs = ONE_SHOT_TIMEOUT_MS[source] ?? 3_000;
    void withTimeout(
      Location.getCurrentPositionAsync({ accuracy, mayShowUserSettingsDialog: false }),
      timeoutMs
    )
      .then((loc) => consider(loc, source))
      .catch(() => {
        // Timed out / denied — watch + other one-shots may still answer.
      })
      .finally(liveSourceEnded);
  }

  // High-accuracy watch refines in parallel — first valid one-shot already updated UI.
  Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 800,
      distanceInterval: 0,
      mayShowUserSettingsDialog: false,
    },
    (loc) => consider(loc, "gps")
  ).then(
    (sub) => {
      if (finished) {
        sub.remove();
        return;
      }
      subscription = sub;
    },
    () => liveSourceEnded()
  );

  return { firstFix, done, stop: finish, best: () => best };
}
