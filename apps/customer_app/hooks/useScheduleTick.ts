/**
 * Single shared 1s clock for open/close countdowns — avoids N setIntervals (one per card).
 */
import { useEffect, useState } from "react";

type Listener = (now: number) => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastNow = Date.now();

function notify() {
  lastNow = Date.now();
  listeners.forEach((l) => l(lastNow));
}

function ensureInterval() {
  if (intervalId != null) return;
  intervalId = setInterval(notify, 1000);
}

function clearIntervalIfIdle() {
  if (listeners.size > 0 || intervalId == null) return;
  clearInterval(intervalId);
  intervalId = null;
}

/** When enabled, returns current time (ms) updated every second. */
export function useScheduleTick(enabled: boolean): number {
  const [now, setNow] = useState(lastNow);

  useEffect(() => {
    if (!enabled) return;
    const listener = (t: number) => setNow(t);
    listeners.add(listener);
    setNow(lastNow);
    ensureInterval();
    return () => {
      listeners.delete(listener);
      clearIntervalIfIdle();
    };
  }, [enabled]);

  return now;
}
