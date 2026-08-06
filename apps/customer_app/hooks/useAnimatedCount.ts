import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Smoothly tweens a displayed number from its previous value toward `value` over
 * `durationMs`, instead of snapping straight to it — used for quantity/price/total
 * displays so each +/- tap (or a bill reconciling in the background) reads as one
 * continuous, visible motion rather than an instant jump. If `value` changes again
 * mid-animation (rapid taps), the animation smoothly re-targets from wherever it
 * currently is rather than restarting from the old target — so a burst of taps
 * still reads as one fluid ramp toward the latest value, never a reset/flicker.
 *
 * `ready` (defaults to true) lets a caller feed a placeholder `value` (e.g. `total ?? 0`)
 * before real data has loaded without it visibly "counting up from 0" once the real
 * number arrives — the first transition after `ready` flips true snaps instead of
 * animating; every value change after that animates normally.
 *
 * ── Why the tick rate is capped ────────────────────────────────────────────
 * The animated value is a *number rendered as text*, so it cannot live on the
 * UI thread as a Reanimated shared value — it has to come back to JS to be
 * formatted. Every tick is therefore a React re-render of whatever subtree reads
 * it, and this hook is called at the top level of the 5,300-line CheckoutScreen
 * as well as four times per cart line. Driven by `requestAnimationFrame` it ran
 * one `setState` per frame, so a single quantity tap re-rendered the whole
 * checkout tree ~16 times, from two concurrent instances, for 260ms — which is
 * what made the Cart/Checkout screens burn CPU on every tap.
 *
 * ~15fps is visually indistinguishable here: the text only shows 2-4 significant
 * digits, so it does not change on most of the frames that were being rendered.
 * The exact target is always emitted on the final tick, so the number the user
 * ends on is never an eased approximation.
 */

/** ~15fps — a quarter of the renders, no visible difference for digits. */
const FRAME_INTERVAL_MS = 66;

export function useAnimatedCount(value: number, durationMs = 260, ready = true): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasReadyRef = useRef(ready);

  useEffect(() => {
    const justBecameReady = ready && !wasReadyRef.current;
    wasReadyRef.current = ready;

    const from = displayRef.current;
    const to = value;
    if (!ready || justBecameReady || Math.abs(to - from) < 0.005) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }
    const startTime = Date.now();
    if (timerRef.current != null) clearTimeout(timerRef.current);

    const step = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      if (t >= 1) {
        displayRef.current = to;
        setDisplay(to);
        timerRef.current = null;
        return;
      }
      const current = from + (to - from) * easeOutCubic(t);
      displayRef.current = current;
      setDisplay(current);
      timerRef.current = setTimeout(step, FRAME_INTERVAL_MS);
    };
    timerRef.current = setTimeout(step, FRAME_INTERVAL_MS);

    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [value, durationMs, ready]);

  return display;
}
