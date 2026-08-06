/**
 * Food-home list scroll activity — card presses ignore gestures that *started*
 * during an active drag/fling. Cleared as soon as the gesture ends so the next
 * deliberate tap is never blocked by a settle delay (missed first taps).
 *
 * These same signals double as the pause/resume trigger for decorative card
 * animations (banner carousels, Ken Burns, offer/ETA tickers), so the frame
 * budget goes to the scroll itself while a gesture is in flight. Every list
 * screen already calls these on drag/momentum, so wiring it here covers all of
 * them without touching each screen.
 */

import {
  markCardAnimationsScrolling,
  markCardAnimationsSettled,
} from "@/hooks/useCardAnimationsEnabled";

let listScrolling = false;
let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumps whenever a list drag starts — in-flight card presses compare against this. */
let scrollGeneration = 0;

/** Parent list began dragging — in-flight presses should cancel. */
export function markFoodHomeListScrollActive(): void {
  listScrolling = true;
  markCardAnimationsScrolling();
  scrollGeneration += 1;
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
}

/** Parent list stopped — clear immediately so the next tap works on first try. */
export function markFoodHomeListScrollEnded(): void {
  markCardAnimationsSettled();
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
  listScrolling = false;
}

/** Safety: clear sticky scroll state (e.g. unmount mid-fling). */
export function resetFoodHomeListScrollGuard(): void {
  markCardAnimationsSettled();
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
