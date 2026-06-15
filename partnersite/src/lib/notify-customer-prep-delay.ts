import { fetchBackend } from '@/lib/fetch-backend';

/** Fire-and-forget customer ETA + push after prep delay (partnersite). */
export async function notifyCustomerPrepDelay(args: {
  ordersCoreId: number;
  additionalMinutes: 5 | 10 | 15;
  storeName?: string | null;
}): Promise<void> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    console.warn("[prep-delay] INTERNAL_API_TOKEN missing — skip customer notify");
    return;
  }
  const res = await fetchBackend('/v1/internal/orders/prep-delay-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify({
      orders_core_id: args.ordersCoreId,
      additional_minutes: args.additionalMinutes,
      store_name: args.storeName ?? undefined,
    }),
    timeoutMs: 8_000,
  });
  if (!res?.ok) {
    console.warn('[prep-delay] customer notify failed:', res?.status ?? 'network');
  }
}
