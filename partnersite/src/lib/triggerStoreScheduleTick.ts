import { fetchBackend } from '@/lib/fetch-backend';

/**
 * Re-evaluate auto open/close for one store (same as merchant app GET /status).
 * Keeps partner portal in sync with backend schedule engine + merchant_stores triple.
 */
export async function triggerStoreScheduleTick(storeInternalId: number): Promise<void> {
  if (!Number.isInteger(storeInternalId) || storeInternalId < 1) return;
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return;

  try {
    await fetchBackend(`/v1/internal/stores/${storeInternalId}/schedule-tick`, {
      method: 'POST',
      headers: { 'X-Internal-Secret': secret },
      timeoutMs: 8_000,
    });
  } catch (err) {
    console.warn('[triggerStoreScheduleTick] request failed:', err);
  }
}
