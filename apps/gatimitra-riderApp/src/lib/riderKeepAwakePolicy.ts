/**
 * Pure policy for Rider foreground keep-awake.
 * One decision for the whole app — screens must not activate/deactivate independently.
 */
export type RiderKeepAwakeInput = {
  /** Rider session present (logged in). */
  hasSession: boolean;
  /** AppState === "active". */
  isForeground: boolean;
  /** dutyStore / server duty. */
  isOnDuty: boolean;
  /** In-progress accepted orders. */
  hasActiveOrder: boolean;
  /** Incoming offer modal / pending dispatch id. */
  hasIncomingOffer: boolean;
};

/**
 * Keep screen awake only while Rider is actively using the app in foreground.
 * Background/lock behavior stays with the OS.
 */
export function shouldRiderKeepScreenAwake(input: RiderKeepAwakeInput): boolean {
  if (!input.hasSession || !input.isForeground) return false;
  // ON-DUTY covers waiting for offers + navigating between tabs.
  // Active order / incoming offer cover edge cases if duty flag lags briefly.
  return input.isOnDuty || input.hasActiveOrder || input.hasIncomingOffer;
}
