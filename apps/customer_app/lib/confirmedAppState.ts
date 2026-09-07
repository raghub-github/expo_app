/**
 * Debounced AppState: Mapbox WebView and permission sheets on Android often
 * fire a fake `background` for ~1s. Treating that as real suspend/resume
 * remounts Expo Go (weather WS + GPS reconcile + React Query refetch storm).
 */

import { AppState, type AppStateStatus } from "react-native";
import {
  BACKGROUND_CONFIRM_MS,
  reduceConfirmedAppState,
  type ConfirmedAppPhase,
} from "@/lib/realtime-lifecycle";

export function subscribeConfirmedAppState(handlers: {
  onSuspend: () => void;
  onResume: () => void;
}): () => void {
  let confirmed: ConfirmedAppPhase = AppState.currentState === "background" ? "background" : "active";
  let pendingBackground = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const apply = (event: "background_started" | "background_confirmed" | "active") => {
    const next = reduceConfirmedAppState(confirmed, pendingBackground, event);
    confirmed = next.confirmed;
    pendingBackground = next.pendingBackground;
    if (next.emit === "suspend") handlers.onSuspend();
    if (next.emit === "resume") handlers.onResume();
  };

  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "background") {
      apply("background_started");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (AppState.currentState !== "background") {
          apply("active");
          return;
        }
        apply("background_confirmed");
      }, BACKGROUND_CONFIRM_MS);
      return;
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (state === "active") apply("active");
  });

  return () => {
    if (timer) clearTimeout(timer);
    sub.remove();
  };
}
