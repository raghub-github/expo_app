/**
 * Device ↔ server clock skew for ETA countdowns.
 * Countdown uses effectiveNowMs() so an incorrect device clock does not drift ETA.
 */

let offsetMs = 0;
let lastSyncedAtMs = 0;

/** Apply serverNow from GET /eta or eta.updated — keeps rolling offset fresh. */
export function noteServerNow(serverNowIso: string | null | undefined, receivedAtMs: number = Date.now()): void {
  if (!serverNowIso?.trim()) return;
  const serverMs = Date.parse(serverNowIso);
  if (!Number.isFinite(serverMs)) return;
  // offset such that Date.now() + offset ≈ server time at receive
  offsetMs = serverMs - receivedAtMs;
  lastSyncedAtMs = receivedAtMs;
}

export function getServerTimeOffsetMs(): number {
  return offsetMs;
}

export function getServerTimeLastSyncedAtMs(): number {
  return lastSyncedAtMs;
}

/** Wall clock corrected toward server time. */
export function effectiveNowMs(deviceNowMs: number = Date.now()): number {
  return deviceNowMs + offsetMs;
}

export function effectiveNowDate(deviceNowMs: number = Date.now()): Date {
  return new Date(effectiveNowMs(deviceNowMs));
}

/**
 * Decay a server snapshot of remaining minutes using age since lastUpdatedAt.
 * Does not invent ETA — only ages the last server-published minutes.
 */
export function decayServerSnapshotMinutes(
  snapshotMinutes: number | null | undefined,
  lastUpdatedAt: string | null | undefined,
  nowMs: number = effectiveNowMs()
): number | null {
  if (snapshotMinutes == null || !Number.isFinite(snapshotMinutes)) return null;
  const base = Math.max(0, Math.round(snapshotMinutes));
  if (!lastUpdatedAt?.trim()) return base;
  const updatedMs = Date.parse(lastUpdatedAt);
  if (!Number.isFinite(updatedMs)) return base;
  const elapsedMin = Math.max(0, (nowMs - updatedMs) / 60_000);
  return Math.max(0, Math.round(base - elapsedMin));
}
