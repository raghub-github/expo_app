/**
 * Pure decision rules for the rider slide-to-confirm control.
 *
 * Kept free of React and react-native so the gesture contract can be tested
 * directly: these two predicates are the difference between a slider that
 * fights the page it sits on and one that does not.
 */

/** Horizontal travel, in px, before a touch counts as a slide rather than a tap. */
export const SLIDE_HORIZONTAL_SLOP = 6;

/** How much more horizontal than vertical the travel must be to claim the gesture. */
export const SLIDE_DIRECTION_BIAS = 1.2;

export type SlideVector = { dx: number; dy: number };

/**
 * Should the slider take over the touch?
 *
 * Only once the finger has moved far enough horizontally, and clearly more
 * horizontally than vertically. Claiming on touch-down instead (the previous
 * behaviour) meant a finger that merely landed on the track swallowed the
 * parent list's vertical scroll.
 */
export function shouldClaimSlide(g: SlideVector, ignoreGestures: boolean): boolean {
  if (ignoreGestures) return false;
  const dx = Math.abs(Number(g.dx) || 0);
  const dy = Math.abs(Number(g.dy) || 0);
  return dx > SLIDE_HORIZONTAL_SLOP && dx > dy * SLIDE_DIRECTION_BIAS;
}

/**
 * Has the rider dragged far enough to fire the action?
 *
 * `maxDrag <= 0` means the track has not been measured yet (onLayout has not
 * landed). That used to make the `dx < maxDrag * ratio` comparison false and
 * fire the action on the slightest movement — an accidental accept. Refuse
 * instead: one lost swipe is far cheaper than an unintended one.
 */
export function shouldCompleteSlide(dx: number, maxDrag: number, ratio: number): boolean {
  const travel = Number(dx);
  const max = Number(maxDrag);
  if (!Number.isFinite(travel) || !Number.isFinite(max)) return false;
  if (max <= 0) return false;
  return travel >= max * ratio;
}
