import { fetchBackend } from '@/lib/fetch-backend';

/** Fire-and-forget customer push after merchant accept (partnersite path). */
export async function notifyCustomerMerchantAccepted(args: {
  ordersCoreId: number;
  fromStatus?: string | null;
  storeName?: string | null;
}): Promise<void> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    console.warn('[merchant-accept] INTERNAL_API_TOKEN missing — skip customer notify');
    return;
  }
  const res = await fetchBackend('/v1/internal/orders/merchant-accept-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify({
      orders_core_id: args.ordersCoreId,
      from_status: args.fromStatus ?? undefined,
      store_name: args.storeName ?? undefined,
    }),
    timeoutMs: 8_000,
  });
  if (!res?.ok) {
    console.warn('[merchant-accept] customer notify failed:', res?.status ?? 'network');
  }
}
