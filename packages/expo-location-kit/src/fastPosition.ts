import * as Location from "expo-location";
import { validateCoords, withTimeout } from "./coords";
import type { FastPosition, FastPositionOptions, FastPositionSource } from "./types";

async function liveQuickFix(
  accuracy: number,
  source: FastPositionSource,
  timeoutMs: number,
  log: FastPositionOptions["log"],
  event: string
): Promise<FastPosition> {
  const loc = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy }),
    timeoutMs
  );
  const v = validateCoords(loc);
  if (!v) throw new Error(`invalid ${event} fix`);
  log?.(event, {
    latitude: v.latitude,
    longitude: v.longitude,
    accuracyM: v.accuracy,
  });
  return {
    ...v,
    source,
    timestampMs: typeof loc?.timestamp === "number" ? loc.timestamp : Date.now(),
  };
}

const DEFAULTS = {
  /** Prefer OS cache longer so cold start / Enable paint without waiting on GPS warm-up. */
  lastKnownMaxAgeMs: 900_000,
  /** Bound live GPS so UI never waits multi-second sequential Balanced→Low. */
  quickTimeoutMs: 1_500,
} as const;

/**
 * FAST first-fix — the opposite priority to {@link getBestEffortPosition}.
 *
 * Goal: return a *usable* coordinate as quickly as possible so the UI can show a
 * location immediately, while a higher-accuracy fix is acquired separately in the
 * background. Order of preference:
 *
 *   1. OS last-known position (near-instant) when fresh enough — no GPS warm-up.
 *   2. Race `Balanced` + `Low` live fixes (short timeout) — first usable wins.
 *
 * This never polls for `Highest` accuracy and never blocks on a stable fix. Callers
 * should follow it with `getBestEffortPosition` (or the shared watcher) to refine.
 *
 * NOTE: intentionally separate from `getBestEffortPosition` — the Rider app relies on
 * that function's accuracy-first behavior for duty tracking, so this must not alter it.
 */
export async function getFastPosition(
  options?: FastPositionOptions
): Promise<FastPosition> {
  const lastKnownMaxAgeMs = options?.lastKnownMaxAgeMs ?? DEFAULTS.lastKnownMaxAgeMs;
  const quickTimeoutMs = options?.quickTimeoutMs ?? DEFAULTS.quickTimeoutMs;
  const log = options?.log;

  // 1) OS last-known — usually resolves in a few ms when the device has any recent fix.
  try {
    const loc = await withTimeout(
      Location.getLastKnownPositionAsync({ maxAge: lastKnownMaxAgeMs }),
      250
    );
    const v = validateCoords(loc);
    if (v) {
      const timestampMs =
        typeof loc?.timestamp === "number" ? loc.timestamp : Date.now();
      log?.("fast-last-known", {
        latitude: v.latitude,
        longitude: v.longitude,
        accuracyM: v.accuracy,
        ageMs: Date.now() - timestampMs,
      });
      return { ...v, source: "last-known", timestampMs };
    }
  } catch {
    // fall through to a live quick fix
  }

  // 2) Race Lowest + Low + Balanced — first usable fix wins (network/cell is often instant).
  const liveRace: Array<Promise<FastPosition>> = [
    liveQuickFix(Location.Accuracy.Lowest, "low", quickTimeoutMs, log, "fast-lowest"),
    liveQuickFix(Location.Accuracy.Low, "low", quickTimeoutMs, log, "fast-low"),
    liveQuickFix(Location.Accuracy.Balanced, "balanced", quickTimeoutMs, log, "fast-balanced"),
  ];

  try {
    return await Promise.any(liveRace);
  } catch {
    throw new Error("Could not get a fast device location");
  }
}
