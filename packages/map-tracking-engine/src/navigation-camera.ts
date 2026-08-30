import { distanceMeters, type LatLng } from "./geo";

export const NAV_CAMERA_MIN_INTERVAL_MS = 280;
export const NAV_CAMERA_MIN_MOVE_M = 2.5;
export const NAV_CAMERA_MIN_BEARING_DELTA = 7;
/** Skip camera follow while the rider is effectively parked. */
export const NAV_CAMERA_STATIONARY_SPEED_MPS = 0.4;

export function shouldThrottleNavigationCamera(
  last: { lat: number; lng: number; bearing: number; atMs: number } | null,
  center: LatLng,
  bearing: number,
  nowMs = Date.now()
): boolean {
  if (!last) return false;
  const elapsed = nowMs - last.atMs;
  if (elapsed < NAV_CAMERA_MIN_INTERVAL_MS) {
    const moved = distanceMeters({ latitude: last.lat, longitude: last.lng }, center);
    const bearingDelta = Math.abs(((bearing - last.bearing + 540) % 360) - 180);
    if (moved < NAV_CAMERA_MIN_MOVE_M && bearingDelta < NAV_CAMERA_MIN_BEARING_DELTA) {
      return true;
    }
  }
  return false;
}

export function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function shouldSkipStationaryCamera(speedMps?: number | null): boolean {
  return speedMps != null && speedMps < NAV_CAMERA_STATIONARY_SPEED_MPS;
}
