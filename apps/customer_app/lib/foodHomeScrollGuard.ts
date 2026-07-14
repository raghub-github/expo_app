/**
 * Food-home list scroll activity — card presses ignore gestures that *started*
 * during an active drag/fling. Cleared as soon as the gesture ends so the next
 * deliberate tap is never blocked by a settle delay (missed first taps).
 */

let listScrolling = false;
let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumps whenever a list drag starts — in-flight card presses compare against this. */
let scrollGeneration = 0;

/** Parent list began dragging — in-flight presses should cancel. */
export function markFoodHomeListScrollActive(): void {
  listScrolling = true;
  scrollGeneration += 1;
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
}

/** Parent list stopped — clear immediately so the next tap works on first try. */
export function markFoodHomeListScrollEnded(): void {
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
  listScrolling = false;
}

/** Safety: clear sticky scroll state (e.g. unmount mid-fling). */
export function resetFoodHomeListScrollGuard(): void {
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
  listScrolling = false;
}

export function isFoodHomeListScrollActive(): boolean {
  return listScrolling;
}

export function getFoodHomeScrollGeneration(): number {
  return scrollGeneration;
}
