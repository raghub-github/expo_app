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
 */
export function useAnimatedCount(value: number, durationMs = 260, ready = true): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);
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
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const step = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs, ready]);

  return display;
}
