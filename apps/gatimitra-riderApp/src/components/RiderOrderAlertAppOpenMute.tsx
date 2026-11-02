/**
 * Opening the rider app must stop any background dispatch buzzer immediately.
 * The incoming offer card can remain; audio stays off until a new authorized alert.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { muteRiderDispatchBuzzerOnAppOpen } from "@/src/lib/nativeDispatchAlert";
import { stopOrderAlertSound } from "@/src/lib/playOrderAlertSound";

export function RiderOrderAlertAppOpenMute() {
  const prev = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const wasBg = prev.current === "background" || prev.current === "inactive";
      prev.current = next;
      if (next !== "active" || !wasBg) return;
      stopOrderAlertSound();
      muteRiderDispatchBuzzerOnAppOpen();
    });
    return () => sub.remove();
  }, []);

  return null;
}
