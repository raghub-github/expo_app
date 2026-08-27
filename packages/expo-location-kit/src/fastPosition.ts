import * as Location from "expo-location";
import { validateCoords, withTimeout } from "./coords";
import type { FastPosition, FastPositionOptions } from "./types";

const DEFAULTS = {
  lastKnownMaxAgeMs: 120_000,
  quickTimeoutMs: 4_000,
} as const;

/**
 * FAST first-fix — the opposite priority to {@link getBestEffortPosition}.
 *
 * Goal: return a *usable* coordinate as quickly as possible so the UI can show a
 * location immediately, while a higher-accuracy fix is acquired separately in the
 * background. Order of preference:
 *
 *   1. OS last-known position (near-instant) when fresh enough — no GPS warm-up.
 *   2. One quick `Balanced` live fix (short timeout) — network/fused, seconds not tens of seconds.
 *   3. One quick `Low` live fix — coarse but fast, last resort before giving up.
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
    const loc = await Location.getLastKnownPositionAsync({ maxAge: lastKnownMaxAgeMs });
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

  // 2) Quick Balanced live fix — bounded so we never wait tens of seconds.
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      quickTimeoutMs
    );
    const v = validateCoords(loc);
    if (v) {
      log?.("fast-balanced", {
        latitude: v.latitude,
        longitude: v.longitude,
        accuracyM: v.accuracy,
      });
      return {
        ...v,
        source: "balanced",
        timestampMs: typeof loc?.timestamp === "number" ? loc.timestamp : Date.now(),
      };
    }
  } catch {
    // fall through to a coarse Low fix
  }

  // 3) Coarse Low live fix — fast, network-assisted, last resort.
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      quickTimeoutMs
    );
    const v = validateCoords(loc);
    if (v) {
      log?.("fast-low", {
        latitude: v.latitude,
        longitude: v.longitude,
        accuracyM: v.accuracy,
      });
      return {
        ...v,
        source: "low",
        timestampMs: typeof loc?.timestamp === "number" ? loc.timestamp : Date.now(),
      };
    }
  } catch {
    // give up below
  }

  throw new Error("Could not get a fast device location");
}
