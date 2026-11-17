import { fetchBackend } from '@/lib/fetch-backend';

const lastTickAtByStore = new Map<number, number>();
const TICK_MIN_GAP_MS = 15_000;
const inflight = new Map<number, Promise<void>>();

/**
 * Re-evaluate auto open/close for one store (same as merchant app GET /status).
 * Keeps partner portal in sync with backend schedule engine + merchant_stores triple.
 * Debounced — dual Partner polls were stampeding schedule-tick after partner-status timeouts.
 */
export async function triggerStoreScheduleTick(storeInternalId: number): Promise<void> {
  if (!Number.isInteger(storeInternalId) || storeInternalId < 1) return;
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return;

  const last = lastTickAtByStore.get(storeInternalId) ?? 0;
  if (Date.now() - last < TICK_MIN_GAP_MS) return;

  const existing = inflight.get(storeInternalId);
  if (existing) {
    await existing;
    return;
  }

  const run = (async () => {
    lastTickAtByStore.set(storeInternalId, Date.now());
    try {
      await fetchBackend(`/v1/internal/stores/${storeInternalId}/schedule-tick`, {
        method: 'POST',
        headers: { 'X-Internal-Secret': secret },
        timeoutMs: 2_000,
      });
    } catch (err) {
      console.warn('[triggerStoreScheduleTick] request failed:', err);
    }
  })();

  inflight.set(storeInternalId, run);
  try {
    await run;
  } finally {
    if (inflight.get(storeInternalId) === run) inflight.delete(storeInternalId);
  }
}
