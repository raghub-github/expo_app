/** Adaptive HTTP recovery cadence — WS live vs WS down vs idle empty pool. */
export const WS_CONNECTED_RECOVERY_MS = 20_000;
/** First polls while the offer websocket is down. Must be slower than a full
 * pending+available round-trip (~4s) or the radio never rests. */
export const WS_DOWN_RECOVERY_MS = 12_000;
/** After several empty recoveries, back off further (idle Home / other tabs). */
export const WS_DOWN_IDLE_BACKOFF_MS = 25_000;
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
