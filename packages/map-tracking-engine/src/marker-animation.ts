/**
 * Marker animation timing helpers — keep motion smooth across GPS cadence.
 */

import { easeOutCubic, haversineMeters } from "./geo";

export type MarkerAnimTiming = {
  /** Position lerp duration (ms). */
  durationMs: number;
  /** Snap immediately when teleport distance exceeds this. */
  snapIfJumpM: number;
};

export function resolveMarkerAnimTiming(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  opts?: { minMs?: number; maxMs?: number; metersPerMs?: number; snapIfJumpM?: number }
): MarkerAnimTiming {
  const jumpM = haversineMeters(fromLat, fromLng, toLat, toLng);
  const snapIfJumpM = opts?.snapIfJumpM ?? 180;
  if (jumpM > snapIfJumpM) {
    return { durationMs: 0, snapIfJumpM };
  }
  const minMs = opts?.minMs ?? 350;
  const maxMs = opts?.maxMs ?? 1100;
  const metersPerMs = opts?.metersPerMs ?? 18;
  const durationMs = Math.min(maxMs, Math.max(minMs, jumpM * metersPerMs));
  return { durationMs, snapIfJumpM };
}

export function resolveHeadingAnimDurationMs(deltaDeg: number): number {
  return Math.min(500, Math.max(180, Math.abs(deltaDeg) * 4));
}

/** Ignore sub-meter GPS duplicates/noise for visual marker updates. */
export const MARKER_NOISE_MOVE_M = 0.4;
/** Speed below which the rider is treated as stationary. */
export const MARKER_STATIONARY_SPEED_MPS = 0.45;
/** Max drift while stationary before we accept a new rendered position. */
export const MARKER_STATIONARY_MAX_DRIFT_M = 25;

export function shouldIgnoreMarkerGpsNoise(moveM: number): boolean {
  return moveM < MARKER_NOISE_MOVE_M;
}

/** Freeze marker animation when parked — avoids GPS drift jitter on screen. */
export function shouldFreezeSmoothedMarker(moveM: number, speedMps: number): boolean {
  if (speedMps < MARKER_STATIONARY_SPEED_MPS && moveM < MARKER_STATIONARY_MAX_DRIFT_M) {
    return true;
  }
  return moveM < 1.5 && speedMps < MARKER_STATIONARY_SPEED_MPS;
}

export { easeOutCubic };

/**
 * Speed-aware lerp budget used by Rider + Customer live markers.
 * Matches the Rider App navigation screen.
 */
export function resolveSmoothDurationMs(speedMps?: number | null): number {
  if (speedMps == null || speedMps < 0.5) return 620;
  if (speedMps < 3) return 480;
  if (speedMps < 8) return 360;
  return 280;
}
