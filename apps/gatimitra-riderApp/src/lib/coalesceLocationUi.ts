/** UI-only GPS coalesce — tracker/engine cadence is unchanged. */

export const COALESCE_MIN_MOVE_M = 2;
export const COALESCE_MIN_HEADING_DEG = 8;
/** Idle Home pin — GPS jitter while standing still must not re-render Mapbox. */
export const COALESCE_IDLE_HOME_MOVE_M = 12;
export const COALESCE_IDLE_HOME_HEADING_DEG = 15;

export function coalesceHaversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function coalesceHeadingDeltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export type CoalesceFixSnapshot = {
  lat: number;
  lng: number;
  heading?: number;
  atMs: number;
};

export function shouldSkipCoalescedFix(
  last: CoalesceFixSnapshot | null,
  next: { lat: number; lng: number; headingDeg?: number },
  _now = Date.now(),
  opts?: { minMoveM?: number; minHeadingDeg?: number }
): boolean {
  if (!last) return false;
  const minMoveM = opts?.minMoveM ?? COALESCE_MIN_MOVE_M;
  const minHeadingDeg = opts?.minHeadingDeg ?? COALESCE_MIN_HEADING_DEG;
  const movedM = coalesceHaversineM(last.lat, last.lng, next.lat, next.lng);
  const headingDelta =
    last.heading != null && next.headingDeg != null
      ? coalesceHeadingDeltaDeg(last.heading, next.headingDeg)
      : 0;
  // Standing still must never push jitter into React. The engine still receives
  // every GPS sample; only the UI subscription is coalesced.
  return movedM < minMoveM && headingDelta < minHeadingDeg;
}
