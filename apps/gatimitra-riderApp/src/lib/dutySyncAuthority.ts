/**
 * Duty sync phases — cached ON-duty may paint the UI, but only SERVER_ON
 * authorizes dispatch lifecycle, WS offers, and duty GPS.
 */
export type DutySyncPhase =
  | "unknown"
  | "syncing"
  | "server_on"
  | "server_off"
  | "sync_failed";

/** Dispatch / WS / duty-GPS may run only after backend confirmed ON. */
export function isDutyDispatchAuthorized(phase: DutySyncPhase): boolean {
  return phase === "server_on";
}

/** Duty GPS (not active-order GPS) requires server-confirmed ON. */
export function isDutyGpsAuthorized(phase: DutySyncPhase): boolean {
  return phase === "server_on";
}

export function dutyPhaseFromServerFlag(isOnDuty: boolean): DutySyncPhase {
  return isOnDuty ? "server_on" : "server_off";
}

/** Bounded backoff with jitter for duty sync retries (caps at 20s). */
export function dutySyncRetryDelayMs(attempt: number): number {
  // First retry quickly after a brief backend blip (was 1.5s → often felt "stuck gated").
  const base = Math.min(20_000, 800 * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.min(400, base * 0.25));
  return base + jitter;
}
