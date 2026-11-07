/** Adaptive HTTP recovery cadence — WS live vs WS down vs idle empty pool. */
/** While WS is live, HTTP recovery is a safety net only — avoid radio stampede. */
export const WS_CONNECTED_RECOVERY_MS = 45_000;
/** First polls while the offer websocket is down. Must be slower than a full
 * pending+available round-trip (~7s on slow LAN) or the radio never rests. */
export const WS_DOWN_RECOVERY_MS = 10_000;
/**
 * Soft idle backoff when WS is down — keep this close to WS_DOWN_RECOVERY_MS.
 * Local Expo Go has no FCM and ws-gateway is often offline; 30s here made
 * dispatched offers look "missing" for half a minute after the pool went empty.
 */
export const WS_DOWN_IDLE_BACKOFF_MS = 15_000;
export const EMPTY_RECOVERY_BACKOFF_AFTER = 3;
export const DUTY_SYNC_MS = 60_000;

export function recoveryIntervalMs(wsLive: boolean, consecutiveEmpty = 0): number {
  if (wsLive) return WS_CONNECTED_RECOVERY_MS;
  if (consecutiveEmpty >= EMPTY_RECOVERY_BACKOFF_AFTER) return WS_DOWN_IDLE_BACKOFF_MS;
  return WS_DOWN_RECOVERY_MS;
}

export function dispatchSessionKey(input: {
  userId?: string | null;
  riderId?: string | null;
  accessToken?: string | null;
}): string {
  const rider = String(input.riderId ?? "").trim() || String(input.userId ?? "").trim();
  // Token rotations must not restart the poll loop — that aborted in-flight
  // /available fetches and left idle Home with an empty pool.
  void input.accessToken;
  return rider;
}
