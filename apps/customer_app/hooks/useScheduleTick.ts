/**
 * Single shared clock for open/close countdowns — avoids N setIntervals (one per card).
 * Pauses while the app is backgrounded so listing screens do not heat the phone.
 * Ticks once per minute (store badges do not need second-level precision).
 */
import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

type Listener = (now: number) => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastNow = Date.now();
let appStateSub: { remove: () => void } | null = null;

function notify() {
  if (AppState.currentState !== "active") return;
  lastNow = Date.now();
  listeners.forEach((l) => l(lastNow));
}

function stopInterval() {
  if (intervalId == null) return;
  clearInterval(intervalId);
  intervalId = null;
}

function ensureInterval() {
  if (intervalId != null) return;
  if (AppState.currentState !== "active") return;
  // Minute-level labels ("opens in 4 min") — 1s was re-rendering every store card per second.
  intervalId = setInterval(notify, 60_000);
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") {
        stopInterval();
        return;
      }
      if (listeners.size > 0) {
        ensureInterval();
        notify();
      }
    });
  }
}

function clearIntervalIfIdle() {
  if (listeners.size > 0) return;
  stopInterval();
}

/** When enabled, returns current time (ms) updated every second while foregrounded. */
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
