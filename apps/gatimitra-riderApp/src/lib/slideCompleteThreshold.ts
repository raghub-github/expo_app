/** Complete only after the thumb travels at least 40% of the drag range. */
export const SLIDE_COMPLETE_RATIO = 0.4;
/** Fallback when track width is unknown (forces a deliberate swipe). */
export const SLIDE_COMPLETE_MIN_PX = 48;

export function slideCompleteThreshold(maxDragPx: number): number {
  if (maxDragPx <= 0) return SLIDE_COMPLETE_MIN_PX;
  return maxDragPx * SLIDE_COMPLETE_RATIO;
}
