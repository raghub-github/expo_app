/**
 * When may a crashed global overlay be remounted?
 *
 * The rider app mounts its order alert, sheets and banners as siblings of the
 * router <Stack> in the root layout, so they sit OUTSIDE every route error
 * boundary. One render throw there took down the whole app — which is why a
 * malformed dispatch offer crashed the app at the exact moment an order
 * appeared.
 *
 * Containing the throw is only half the fix. An overlay that stays dead means
 * the rider silently stops seeing orders, which is worse than a crash because
 * nothing tells them. So a failed overlay is remounted after a short cool-off,
 * with a bounded number of attempts: a genuinely transient payload recovers on
 * the next offer, while a deterministic crash settles instead of spinning in a
 * mount-throw-mount loop that would burn the battery and flood the logs.
 */

export const OVERLAY_MAX_REMOUNTS = 3;
export const OVERLAY_REMOUNT_DELAY_MS = 4_000;
/** Failures older than this are forgiven — a crash an hour ago is not this crash. */
export const OVERLAY_FAILURE_FORGET_MS = 5 * 60 * 1000;

export type OverlayRemountDecision =
  | { remount: true; delayMs: number }
  | { remount: false; reason: "exhausted" };

export function decideOverlayRemount(args: {
  /** Consecutive failures counted so far, including the one just caught. */
  failureCount: number;
  /** ms since the previous failure, or null if this is the first. */
  msSincePreviousFailure: number | null;
}): OverlayRemountDecision {
  const since = args.msSincePreviousFailure;
  // A long quiet period means the overlay was working fine in between, so this
  // is a fresh incident rather than a loop.
  const effectiveCount =
    since != null && since > OVERLAY_FAILURE_FORGET_MS ? 1 : Math.max(1, args.failureCount);

  if (effectiveCount > OVERLAY_MAX_REMOUNTS) {
    return { remount: false, reason: "exhausted" };
  }
  // Back off a little further each time so a crash-loop slows down.
  return { remount: true, delayMs: OVERLAY_REMOUNT_DELAY_MS * effectiveCount };
}
