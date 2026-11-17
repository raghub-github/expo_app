/**
 * Background ↔ in-app audio handoff (DEVICE-LOCAL only).
 *
 * Foreground:
 *   Mute THIS device's native FGS buzzer only. Do NOT start the JS chime here —
 *   IncomingOrderModal.takeoverNewOrderAlertByModal owns in-app audio when the
 *   accept sheet opens. Starting playback here raced the modal and caused
 *   native + JS buzzers to overlap on app open.
 *
 * Background:
 *   Stop the JS chime so native remount/rearm can own audio again.
 *
 * Other phones logged into the same account keep ringing until a GLOBAL
 * accept/reject stop arrives.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { muteNewOrderAlertOnAppOpen } from "@/lib/newOrderAlertManager";
import { stopOrderAlertSound } from "@/lib/playOrderAlertSound";

function silenceNativeOnForeground() {
  stopOrderAlertSound();
  void muteNewOrderAlertOnAppOpen();
}

export default function OrderAlertAppOpenMute() {
  const prev = useRef<AppStateStatus>(AppState.currentState);
  const mutedOnceRef = useRef(false);

  useEffect(() => {
    // Cold/warm launch already active while FGS is ringing (notification tap).
    if (AppState.currentState === "active" && !mutedOnceRef.current) {
      mutedOnceRef.current = true;
      silenceNativeOnForeground();
    }

    const sub = AppState.addEventListener("change", (next) => {
      const wasBg = prev.current === "background" || prev.current === "inactive";
      const wasActive = prev.current === "active";
      prev.current = next;
      if (next === "active" && wasBg) {
        mutedOnceRef.current = true;
        silenceNativeOnForeground();
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
