import { fetchBackend } from '@/lib/fetch-backend';

/** Ask Fastify live ETA engine to refresh customer-facing minutes after merchant accept. */
export async function triggerOrderEtaRecalcAfterAccept(
  orderIdText: string,
  reason: 'STATUS_CHANGE' | 'MERCHANT_DELAY' = 'STATUS_CHANGE'
): Promise<boolean> {
  const id = orderIdText.trim();
  if (!id) return false;

  const res = await fetchBackend(`/v1/eta/orders/${encodeURIComponent(id)}/recalc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
    timeoutMs: 8_000,
  });
  return res?.ok ?? false;
}
