/** In-memory ride search expiry — survives ride-searching screen remounts (Track ↔ back). */
type RideSearchTimerSnapshot = {
  expiresAt: string;
  windowSec: number;
};

const expiryByOrderId = new Map<string, RideSearchTimerSnapshot>();

export function rememberRideSearchTimer(
  orderId: string,
  expiresAt: string,
  windowSec: number
): void {
  const id = orderId.trim();
  const at = expiresAt.trim();
  if (!id || !at) return;
  expiryByOrderId.set(id, { expiresAt: at, windowSec: Math.max(1, windowSec) });
}

export function readRideSearchTimer(orderId: string): RideSearchTimerSnapshot | null {
  const id = orderId.trim();
  if (!id) return null;
  return expiryByOrderId.get(id) ?? null;
}

export function clearRideSearchTimer(orderId: string): void {
  const id = orderId.trim();
  if (!id) return;
  expiryByOrderId.delete(id);
}

export function remainingSecFromExpiresAt(
  expiresAt: string | null | undefined,
  fallbackSec = 0
): number {
  if (!expiresAt?.trim()) return fallbackSec;
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return fallbackSec;
  return Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
}
