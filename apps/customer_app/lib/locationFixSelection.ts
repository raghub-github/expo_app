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
/** A fix older than this no longer says where the user is, whatever accuracy it claims. */
export const STALE_FIX_AGE_MS = 15 * 60_000;
/** GPS noise on even a sharp fix: below what any consumer of the pin can use (metres). */
export const PIN_HOLD_MIN_M = 10;
/** A fix further than this always moves the pin, however rough it claims to be (metres). */
export const PIN_HOLD_MAX_M = 30;

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
 * True when a new fix is no evidence that the pin on screen is wrong: the pin already lies
 * inside the fix's own error radius. Moving it would re-render every subscriber and re-key
 * every coordinate-keyed request just to follow noise, while a phone that is standing
 * still reports fixes metres apart. Measured from the pin, so a real walk still gets out.
 */
export function pinStillHolds(
  pin: { latitude: number; longitude: number },
  fix: { latitude: number; longitude: number; accuracy: number | null }
): boolean {
  const radius = Math.min(PIN_HOLD_MAX_M, Math.max(PIN_HOLD_MIN_M, fix.accuracy ?? 0));
  return metresBetween(pin.latitude, pin.longitude, fix.latitude, fix.longitude) <= radius;
}

/**
 * §23 — reject an obviously invalid jump: a large move whose implied speed is impossible
 * for the elapsed time. If the previous fix is old (large dt), any distance is plausible,
 * so a genuine relocation (e.g. opened the app after a flight) is NOT rejected.
 *
 * Distance is measured beyond both fixes' accuracy radii. A cell-tower fix can be
 * kilometres out, and without this the GPS fix arriving seconds later looked like an
 * impossible jump from it and was thrown away, leaving the bad fix in place.
 */
export function isImplausibleJump(prev: FixLike | null, next: FixLike): boolean {
  if (!prev || !prev.timestampMs) return false;
  const dist = metresBetween(prev.latitude, prev.longitude, next.latitude, next.longitude);
  const beyondUncertainty = dist - (prev.accuracy ?? 0) - (next.accuracy ?? 0);
  if (beyondUncertainty < OUTLIER_MIN_JUMP_M) return false;
  const dtSec = Math.max(1, (next.timestampMs - prev.timestampMs) / 1000);
  return beyondUncertainty / dtSec > MAX_PLAUSIBLE_SPEED_MPS;
}

/**
 * §22/§30 — decide whether `next` should replace `current`:
 *  - no current            → accept
 *  - implausible jump      → reject (keep current)
 *  - coarse fix inside its own error radius of a sharper, still-recent one → reject (no evidence of a move)
 *  - genuine move (>30 m)  → accept (user actually moved)
 *  - same spot, current has no known accuracy → accept
 *  - same spot, next has no known accuracy     → reject (don't drop known accuracy)
 *  - same spot             → accept only if accuracy did not materially worsen
 */
export function shouldReplaceFix(current: FixLike | null, next: FixLike): boolean {
  if (!current) return true;
  if (isImplausibleJump(current, next)) return false;
  const moved = metresBetween(current.latitude, current.longitude, next.latitude, next.longitude);
  const nextIsCoarser =
    next.accuracy != null && current.accuracy != null && next.accuracy > current.accuracy + ACCURACY_SLACK_M;
  const currentIsStale = next.timestampMs - current.timestampMs > STALE_FIX_AGE_MS;
  if (nextIsCoarser && !currentIsStale && moved <= next.accuracy!) return false;
  if (moved >= REAL_MOVE_THRESHOLD_M) return true;
  if (current.accuracy == null) return true;
  if (next.accuracy == null) return false;
  return next.accuracy <= current.accuracy + ACCURACY_SLACK_M;
}
