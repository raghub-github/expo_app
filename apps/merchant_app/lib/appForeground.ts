/**
 * Single AppState subscription for the merchant app.
 * Pollers and WebSockets should pause when the app is backgrounded.
 */
import { AppState, type AppStateStatus } from "react-native";

type ForegroundListener = (active: boolean) => void;

let current: AppStateStatus = AppState.currentState;
const listeners = new Set<ForegroundListener>();
let subscribed = false;

function emit() {
  const active = current === "active";
  for (const fn of listeners) fn(active);
}

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  AppState.addEventListener("change", (next) => {
    if (next === current) return;
    current = next;
    emit();
  });
}

export function isAppForeground(): boolean {
  return current === "active";
}

/** Subscribe to foreground/background transitions. Returns unsubscribe. */
export function subscribeAppForeground(listener: ForegroundListener): () => void {
  ensureSubscribed();
  listeners.add(listener);
  listener(current === "active");
  return () => listeners.delete(listener);
}
