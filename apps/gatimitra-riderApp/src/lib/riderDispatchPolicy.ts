/** Adaptive HTTP recovery cadence — WS live vs WS down. */
export const WS_CONNECTED_RECOVERY_MS = 20_000;
export const WS_DOWN_RECOVERY_MS = 6_000;
export const DUTY_SYNC_MS = 60_000;

export function recoveryIntervalMs(wsLive: boolean): number {
  return wsLive ? WS_CONNECTED_RECOVERY_MS : WS_DOWN_RECOVERY_MS;
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
