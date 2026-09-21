import { fetchBackend } from '@/lib/fetch-backend';

/** Fire-and-forget customer + merchant + rider push after a cancel (partnersite path). */
export async function notifyOrderCancelled(args: {
  ordersCoreId: number;
  fromStatus?: string | null;
  storeName?: string | null;
  reason?: string | null;
}): Promise<void> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    console.warn('[order-cancel] INTERNAL_API_TOKEN missing — skip cancel notify');
    return;
  }
  const res = await fetchBackend('/v1/internal/orders/cancel-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify({
      orders_core_id: args.ordersCoreId,
      from_status: args.fromStatus ?? undefined,
      store_name: args.storeName ?? undefined,
      reason: args.reason ?? undefined,
    }),
    timeoutMs: 8_000,
  });
  if (!res?.ok) {
    console.warn('[order-cancel] notify failed:', res?.status ?? 'network');
  }
}
