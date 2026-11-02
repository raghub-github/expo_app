/**
 * When the partner brings the app to the foreground, stop every order buzzer
 * immediately. Pending orders stay in the Incoming sheet — audio must not.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { muteNewOrderAlertOnAppOpen } from "@/lib/newOrderAlertManager";
import { stopOrderAlertSound } from "@/lib/playOrderAlertSound";

export default function OrderAlertAppOpenMute() {
  const prev = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const wasBg = prev.current === "background" || prev.current === "inactive";
      prev.current = next;
      if (next !== "active" || !wasBg) return;
      stopOrderAlertSound();
      void muteNewOrderAlertOnAppOpen();
    });
    return () => sub.remove();
  }, []);

  return null;
}
