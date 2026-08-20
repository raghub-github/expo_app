/**
 * In-memory device-session validity for merchant/rider JWTs.
 * Shared so login can invalidate a cached "signed out" result immediately.
 */

type DeviceSessionCacheEntry = {
  valid: boolean;
  checkedAt: number;
};

const cache = new Map<string, DeviceSessionCacheEntry>();

export const DEVICE_SESSION_CACHE_MS = 45_000;
export const DEVICE_SESSION_STALE_MS = 5 * 60_000;

function cacheKey(sub: string, deviceId: string): string {
  return `${sub}:${deviceId}`;
}

export function readDeviceSessionCache(
  sub: string,
  deviceId: string,
  maxAgeMs = DEVICE_SESSION_CACHE_MS
): boolean | null {
  const cached = cache.get(cacheKey(sub, deviceId));
  if (!cached || Date.now() - cached.checkedAt > maxAgeMs) return null;
  return cached.valid;
}

export function writeDeviceSessionCache(sub: string, deviceId: string, valid: boolean): void {
  cache.set(cacheKey(sub, deviceId), { valid, checkedAt: Date.now() });
}

/** Call after login / session upsert so location pings are not stuck on a cached 401. */
export function markDeviceSessionActive(sub: string, deviceId: string): void {
  writeDeviceSessionCache(sub, deviceId, true);
}

export function invalidateDeviceSessionCache(sub: string, deviceId?: string | null): void {
  if (deviceId) {
    cache.delete(cacheKey(sub, deviceId));
    return;
  }
  const prefix = `${sub}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
