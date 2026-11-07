/**
 * Opening the rider app must stop any background dispatch buzzer immediately.
 * The incoming offer card can remain; audio stays off until a new authorized alert.
 *
 * Also: cold/warm launch that lands already `active` (notification tap) must mute —
 * AppState "change" alone never fires when there was no background→active transition.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  muteRiderDispatchBuzzerOnAppOpen,
  reconcileRiderDispatchAlertOnAppOpen,
} from "@/src/lib/nativeDispatchAlert";
import { stopOrderAlertSound } from "@/src/lib/playOrderAlertSound";

function silenceOnForeground() {
  stopOrderAlertSound();
  void reconcileRiderDispatchAlertOnAppOpen();
  muteRiderDispatchBuzzerOnAppOpen();
}

export function RiderOrderAlertAppOpenMute() {
  const prev = useRef<AppStateStatus>(AppState.currentState);
  const mutedOnceRef = useRef(false);

  useEffect(() => {
    // Cold / warm start already in foreground while FGS is ringing.
    if (AppState.currentState === "active" && !mutedOnceRef.current) {
      mutedOnceRef.current = true;
      silenceOnForeground();
    }

    const sub = AppState.addEventListener("change", (next) => {
      const wasBg = prev.current === "background" || prev.current === "inactive";
      prev.current = next;
      if (next !== "active" || !wasBg) return;
      mutedOnceRef.current = true;
      silenceOnForeground();
    });
    return () => sub.remove();
  }, []);

  return null;
}
