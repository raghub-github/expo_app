/**
 * Session memory cache for parcel quote-batch results — instant fare on back-nav / remount.
 */

type CachedParcelFares = {
  fares: Record<string, number>;
  savedAt: number;
};

const MAX_AGE_MS = 10 * 60 * 1000;
const cache = new Map<string, CachedParcelFares>();

export function getCachedParcelFares(quoteKey: string): Record<string, number> | null {
  const hit = cache.get(quoteKey);
  if (!hit) return null;
  if (Date.now() - hit.savedAt > MAX_AGE_MS) {
    cache.delete(quoteKey);
    return null;
  }
  return hit.fares;
}

export function setCachedParcelFares(
  quoteKey: string,
  fares: Record<string, number>
): void {
  if (Object.keys(fares).length === 0) return;
  cache.set(quoteKey, { fares: { ...fares }, savedAt: Date.now() });
}
