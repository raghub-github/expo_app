/**
 * Pure accuracy-aware fix selection + outlier rejection (spec §22, §23, §30).
 *
 * Kept dependency-free (its own haversine, no expo/RN imports) so the "never trade
 * accuracy for speed blindly" decision logic is unit-testable in isolation.
 */

export type FixLike = {
  latitude: number;
  longitude: number;
  /** GPS accuracy radius in metres; null when unknown. */
  accuracy: number | null;
  /** ms epoch the fix was captured. */
  timestampMs: number;
};

/** Below this jump distance, a move is always accepted (normal GPS wander/travel). */
export const OUTLIER_MIN_JUMP_M = 500;
/** Above this implied speed a large jump is rejected as impossible (~216 km/h). */
export const MAX_PLAUSIBLE_SPEED_MPS = 60;
/** A move beyond this is treated as the user genuinely relocating (not noise). */
export const REAL_MOVE_THRESHOLD_M = 30;
/** Allowed accuracy slack (m) before a same-spot fix counts as a downgrade. */
export const ACCURACY_SLACK_M = 5;

export function metresBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * §23 — reject an obviously invalid jump: a large move whose implied speed is impossible
 * for the elapsed time. If the previous fix is old (large dt), any distance is plausible,
 * so a genuine relocation (e.g. opened the app after a flight) is NOT rejected.
 */
export function isImplausibleJump(prev: FixLike | null, next: FixLike): boolean {
  if (!prev || !prev.timestampMs) return false;
  const dist = metresBetween(prev.latitude, prev.longitude, next.latitude, next.longitude);
  if (dist < OUTLIER_MIN_JUMP_M) return false;
  const dtSec = Math.max(1, (next.timestampMs - prev.timestampMs) / 1000);
  return dist / dtSec > MAX_PLAUSIBLE_SPEED_MPS;
}

/**
 * §22/§30 — decide whether `next` should replace `current`:
 *  - no current            → accept
 *  - implausible jump      → reject (keep current)
 *  - genuine move (>30 m)  → accept (user actually moved)
 *  - same spot, current has no known accuracy → accept
 *  - same spot, next has no known accuracy     → reject (don't drop known accuracy)
 *  - same spot             → accept only if accuracy did not materially worsen
 */
export function shouldReplaceFix(current: FixLike | null, next: FixLike): boolean {
  if (!current) return true;
  if (isImplausibleJump(current, next)) return false;
  if (metresBetween(current.latitude, current.longitude, next.latitude, next.longitude) >= REAL_MOVE_THRESHOLD_M) {
    return true;
  }
  if (current.accuracy == null) return true;
  if (next.accuracy == null) return false;
  return next.accuracy <= current.accuracy + ACCURACY_SLACK_M;
}
