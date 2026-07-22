import * as Location from "expo-location";
import { validateCoords, withTimeout } from "./coords";
import type { BestEffortPositionOptions, ValidatedCoords } from "./types";

const DEFAULTS = {
  attemptTimeoutMs: 14_000,
  stableWaitMs: 9_000,
  acceptableAccuracyM: 20,
  maxAttempts: 4,
  repollGapMs: 800,
  lastKnownMaxAgeMs: 60_000,
} as const;

/**
 * Acquire a best-effort GPS fix:
 * Highest retries (bounded) → Balanced → recent OS last-known.
 */
export async function getBestEffortPosition(
  options?: BestEffortPositionOptions
): Promise<ValidatedCoords> {
  const attemptTimeoutMs = options?.attemptTimeoutMs ?? DEFAULTS.attemptTimeoutMs;
  const stableWaitMs = options?.stableWaitMs ?? DEFAULTS.stableWaitMs;
  const acceptableAccuracyM = options?.acceptableAccuracyM ?? DEFAULTS.acceptableAccuracyM;
  const maxAttempts = options?.maxAttempts ?? DEFAULTS.maxAttempts;
  const repollGapMs = options?.repollGapMs ?? DEFAULTS.repollGapMs;
  const lastKnownMaxAgeMs = options?.lastKnownMaxAgeMs ?? DEFAULTS.lastKnownMaxAgeMs;
  const log = options?.log;

  let best: ValidatedCoords | null = null;
  let lastErr: unknown;
  const deadline = Date.now() + stableWaitMs;

  for (let attempt = 1; attempt <= maxAttempts && Date.now() < deadline; attempt++) {
    try {
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
        attemptTimeoutMs
      );
      const v = validateCoords(loc);
      if (v) {
        log?.("gps-fix", {
          attempt,
          latitude: v.latitude,
          longitude: v.longitude,
          accuracyM: v.accuracy,
        });
        if (
          best == null ||
          (v.accuracy != null && (best.accuracy == null || v.accuracy < best.accuracy))
        ) {
          best = v;
        }
        if (v.accuracy != null && v.accuracy <= acceptableAccuracyM) {
          return v;
        }
      }
    } catch (e) {
      lastErr = e;
      break;
    }
    if (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, repollGapMs));
    }
  }

  if (!best) {
    try {
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        attemptTimeoutMs
      );
      const v = validateCoords(loc);
      if (v) {
        log?.("gps-fix-balanced", {
          latitude: v.latitude,
          longitude: v.longitude,
          accuracyM: v.accuracy,
        });
        best = v;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (best) {
    log?.("gps-fix-final", {
      latitude: best.latitude,
      longitude: best.longitude,
      accuracyM: best.accuracy,
    });
    return best;
  }

  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: lastKnownMaxAgeMs,
    });
    const v = validateCoords(lastKnown);
    if (v) {
      log?.("gps-last-known", {
        latitude: v.latitude,
        longitude: v.longitude,
        accuracyM: v.accuracy,
      });
      return v;
    }
  } catch {
    // ignore
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error("Could not get device location");
}
