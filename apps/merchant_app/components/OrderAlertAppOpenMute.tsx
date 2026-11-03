/**
 * Background ↔ in-app audio handoff (DEVICE-LOCAL only).
 *
 * Foreground:
 *   1. Stop THIS device's native FGS buzzer (mute — not global stop).
 *   2. Hand audio to the JS Incoming chime for still-actionable orders.
 *
 * Background:
 *   Stop the JS chime so native remount/rearm can own audio again.
 *
 * Other phones logged into the same account keep ringing until a GLOBAL
 * accept/reject stop arrives.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { handoffBackgroundAlertToInApp } from "@/lib/newOrderAlertManager";
import { stopOrderAlertSound } from "@/lib/playOrderAlertSound";

export default function OrderAlertAppOpenMute() {
  const prev = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const wasBg = prev.current === "background" || prev.current === "inactive";
      const wasActive = prev.current === "active";
      prev.current = next;
      if (next === "active" && wasBg) {
        stopOrderAlertSound();
        void handoffBackgroundAlertToInApp();
        return;
      }
      if (wasActive && (next === "background" || next === "inactive")) {
        // Free the channel for native remount/rearm on this device only.
        stopOrderAlertSound();
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
