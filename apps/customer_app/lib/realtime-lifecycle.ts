/**
 * Shared AppState / WebSocket catch-up rules for Customer realtime transports.
 * Keep sockets from heartbeating in the pocket, without reconnect storms on iOS
 * "inactive" (control center / notification shade).
 */

export function shouldSuspendRealtimeTransport(appState: string): boolean {
  return appState === "background";
}

/** Full REST catch-up after a reconnect that may have missed frames. */
export function shouldCatchUpAfterWsOpen(reason: string): boolean {
  return reason === "mount" || reason === "resume_long" || reason.startsWith("backoff");
}
