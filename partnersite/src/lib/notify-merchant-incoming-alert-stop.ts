import { fetchBackend } from '@/lib/fetch-backend';

/**
 * Tell every Partner App device to kill the NEW ORDER buzzer / overlay for this
 * food order. Separate from customer accept-notify so a missing customer push
 * path cannot leave phones ringing after Partner Website accept/reject.
 */
export async function notifyMerchantIncomingAlertStop(args: {
  storeId: number;
  foodOrderId: number;
  ordersCoreId?: number | null;
  status: string;
}): Promise<void> {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    console.warn('[merchant-alert-stop] INTERNAL_API_TOKEN missing — skip FCM stop');
    return;
  }
  const storeId = Number(args.storeId);
  const foodOrderId = Number(args.foodOrderId);
  if (!Number.isInteger(storeId) || storeId < 1) return;
  if (!Number.isInteger(foodOrderId) || foodOrderId < 1) return;

  const res = await fetchBackend('/v1/internal/orders/merchant-alert-stop', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify({
      store_id: storeId,
      food_order_id: foodOrderId,
      orders_core_id:
        args.ordersCoreId != null && Number.isFinite(Number(args.ordersCoreId))
          ? Number(args.ordersCoreId)
          : undefined,
      status: String(args.status ?? '').trim().toUpperCase() || 'TERMINAL',
    }),
    timeoutMs: 5_000,
  });
  if (!res?.ok) {
    console.warn('[merchant-alert-stop] failed:', res?.status ?? 'network');
  }
}
