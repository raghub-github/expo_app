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

export { easeOutCubic };
