import { useEffect, useState } from "react";

/**
 * Local clock for countdown UI. Keep this inside the component that displays
 * the timer — never lift it into a screen-wide or context value, or the whole
 * tree re-renders every tick.
 */
export function useNowMs(enabled = true, intervalMs = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);

  return nowMs;
}
