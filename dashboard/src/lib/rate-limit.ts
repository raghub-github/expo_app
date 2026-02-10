/**
 * Simple in-memory rate limit for export endpoints.
 * Key by user id; allow max N requests per windowMs.
 */

const store = new Map<number, number[]>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

export function checkExportRateLimit(userId: number): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let timestamps = store.get(userId) ?? [];
  timestamps = timestamps.filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterMs: Math.ceil(WINDOW_MS - (now - oldest)) };
  }
  timestamps.push(now);
  store.set(userId, timestamps);
  return { allowed: true };
}
