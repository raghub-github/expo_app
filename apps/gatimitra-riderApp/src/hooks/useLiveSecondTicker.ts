import { useEffect, useState } from "react";

/** Re-render once per second for live countdowns / delay timers. */
export function useLiveSecondTicker(active = true): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  return nowMs;
}
