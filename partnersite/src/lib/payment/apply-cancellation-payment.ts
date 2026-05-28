import { client as pgClient } from '@/lib/drizzle';

type PaymentCancelledBy = 'CUSTOMER' | 'MERCHANT' | 'RIDER' | 'ADMIN' | 'SYSTEM' | 'PLATFORM' | null;

function resolveMilestone(previousStatus: string, cancelledByType: string) {
  const prev = String(previousStatus ?? '').toUpperCase();
  const actor = String(cancelledByType ?? 'store').toLowerCase();
  let cancelledBy: PaymentCancelledBy = null;
  if (actor === 'customer') cancelledBy = 'CUSTOMER';
  else if (actor === 'store' || actor === 'merchant') cancelledBy = 'MERCHANT';
  else if (actor === 'rider') cancelledBy = 'RIDER';
  else if (actor === 'admin' || actor === 'dashboard') cancelledBy = 'ADMIN';
  else if (actor === 'system' || actor === 'auto') cancelledBy = 'SYSTEM';

  if (prev === 'DELIVERED') return { orderMilestone: 'CANCELLED_AFTER_DELIVERED', cancelledBy };
  if (prev === 'OUT_FOR_DELIVERY' || prev === 'PICKED_UP') {
    return { orderMilestone: 'POST_PICKUP_CANCELLED', cancelledBy };
  }
  if (prev === 'READY_FOR_PICKUP' || prev === 'RIDER_ASSIGNED') {
    return { orderMilestone: 'RIDER_ASSIGNED', cancelledBy };
  }
  if (prev === 'PREPARING') return { orderMilestone: 'MERCHANT_PREPARING', cancelledBy };
  if (prev === 'ACCEPTED') return { orderMilestone: 'ORDER_ACCEPTED', cancelledBy };
  return { orderMilestone: 'PRE_PICKUP_CANCELLED', cancelledBy };
}

export async function applyPaymentCancellationPayment(input: {
  orderCoreId: number;
  ordersFoodId: number;
  merchantStoreId: number;
  previousStatus: string;
  cancelledByType: string;
  orderGross: number;
}) {
  const { orderMilestone, cancelledBy } = resolveMilestone(
    input.previousStatus,
    input.cancelledByType
  );
  const gross = Number(input.orderGross);
  if (!Number.isFinite(gross) || gross < 0) return { applied: false };

  try {
    const rows = await pgClient`
      SELECT payment_apply_cancellation(
        ${input.orderCoreId}::bigint,
        ${input.ordersFoodId}::bigint,
        ${orderMilestone}::payment_order_milestone,
        ${cancelledBy}::payment_cancelled_by,
        ${gross}::numeric,
        NULL::bigint,
        ${`cancel:${input.orderCoreId}:${orderMilestone}`}::text
      )::jsonb AS result
    `;
    const result = (rows[0] as { result?: { ok?: boolean } })?.result;
    return { applied: Boolean(result?.ok), result };
  } catch {
    return { applied: false };
  }
}
