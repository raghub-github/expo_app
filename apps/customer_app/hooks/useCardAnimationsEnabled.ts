/**
 * Global gate for decorative, always-running card animations.
 *
 * Restaurant cards each run several never-ending animations: an infinite Ken
 * Burns zoom, an auto-rotating banner carousel, and two text tickers driven by
 * `setInterval`. Individually cheap; multiplied by every mounted card they were
 * the single largest contributor to sustained GPU + JS load on the listing
 * screens, and none of it was gated on anything.
 *
 * Two gates are applied here:
 *
 *   1. **App state** — animations stop entirely while the app is backgrounded.
 *      On Android, JS timers and the UI-thread animator keep running with the
 *      screen off, so this was burning battery in the user's pocket.
 *   2. **Scroll** — animations pause during an active scroll gesture, so the
 *      frame budget goes to the scroll itself. This is what keeps list scrolling
 *      smooth on low-end devices: decorative motion is exactly the work worth
 *      dropping when frames are scarce.
 *
 * Cards call `useCardAnimationsEnabled()` and pass the result into whatever
 * `enabled` flag their animation already had, so nothing changes visually when
 * the app is foregrounded and at rest.
 */

import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();
/**
 * Defaults to true rather than testing `AppState.currentState`: at module-load
 * time Android can still report "unknown", and starting from false there would
 * leave every card animation permanently off until the first state *change*
 * event — which never arrives if the app simply stays foregrounded.
 */
let appActive = AppState.currentState !== "background";
let scrolling = false;
let lastEnabled = appActive;
let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;

function publish() {
  const next = appActive && !scrolling;
  if (next === lastEnabled) return;
  lastEnabled = next;
  listeners.forEach((l) => l(next));
}

AppState.addEventListener("change", (state: AppStateStatus) => {
  appActive = state === "active";
  publish();
});

/** Called by list screens on scroll begin. */
export function markCardAnimationsScrolling() {
  if (scrollIdleTimer) {
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = null;
  }
  if (scrolling) return;
  scrolling = true;
  publish();
}

/**
 * Called on scroll end. Resumes after a short settle delay so a flick that
 * momentarily reports "ended" does not restart every animation mid-deceleration.
 */
export function markCardAnimationsSettled() {
  if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    scrollIdleTimer = null;
    scrolling = false;
    publish();
  }, 220);
}

export function useCardAnimationsEnabled(): boolean {
  const [enabled, setEnabled] = useState(lastEnabled);

  useEffect(() => {
    const listener: Listener = (next) => setEnabled(next);
    listeners.add(listener);
    setEnabled(lastEnabled);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return enabled;
}
