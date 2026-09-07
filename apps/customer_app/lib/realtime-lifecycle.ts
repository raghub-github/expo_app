/**
 * Shared AppState / WebSocket catch-up rules for Customer realtime transports.
 * Keep sockets from heartbeating in the pocket, without reconnect storms on iOS
 * "inactive" (control center / notification shade) or Android Mapbox WebView
 * false "background" blips that otherwise remount Expo Go.
 */

/** Android Mapbox / permission sheets often fire a ~1s fake background. */
export const BACKGROUND_CONFIRM_MS = 2_500;

export function shouldSuspendRealtimeTransport(appState: string): boolean {
  return appState === "background";
}

/** Full REST catch-up after a reconnect that may have missed frames. */
export function shouldCatchUpAfterWsOpen(reason: string): boolean {
  return reason === "mount" || reason === "resume_long" || reason.startsWith("backoff");
}

export type ConfirmedAppPhase = "active" | "background";

/**
 * Pure gate: ignore background blips that return to active before confirm.
 * `background_confirmed` is only applied when the OS is still backgrounded.
 */
export function reduceConfirmedAppState(
  confirmed: ConfirmedAppPhase,
  pendingBackground: boolean,
  event: "background_started" | "background_confirmed" | "active"
): { confirmed: ConfirmedAppPhase; pendingBackground: boolean; emit: "suspend" | "resume" | "cancel" | null } {
  if (event === "background_started") {
    return { confirmed, pendingBackground: true, emit: null };
  }
  if (event === "background_confirmed") {
    if (!pendingBackground || confirmed === "background") {
      return { confirmed, pendingBackground: false, emit: null };
    }
    return { confirmed: "background", pendingBackground: false, emit: "suspend" };
  }
  // active
  if (pendingBackground) {
    return { confirmed, pendingBackground: false, emit: "cancel" };
  }
  if (confirmed === "background") {
    return { confirmed: "active", pendingBackground: false, emit: "resume" };
  }
  return { confirmed, pendingBackground: false, emit: null };
}
