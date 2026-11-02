import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Local clock for countdown UI.
 * Prefer one shared clock per list screen (pass `nowMs` into cards) so you don't
 * spawn N × 1s timers. Pauses while the app is backgrounded to cut heat/CPU.
 */
export function useNowMs(enabled = true, intervalMs = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;

    let id: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };

    const start = () => {
      stop();
      setNowMs(Date.now());
      id = setInterval(() => setNowMs(Date.now()), intervalMs);
    };

    if (AppState.currentState === "active") start();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") start();
      else stop();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => {
      sub.remove();
      stop();
    };
  }, [enabled, intervalMs]);

  return nowMs;
}
