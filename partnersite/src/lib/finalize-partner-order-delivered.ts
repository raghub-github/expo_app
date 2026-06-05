import type { SupabaseClient } from '@supabase/supabase-js';
import { creditMerchantOrderEarningOnDelivered } from '@/lib/credit-merchant-order-on-delivered';
import {
  computeMerchantCtmForPartnerOrder,
  resolveMerchantWalletCreditAmount,
} from '@/lib/merchant-order-ctm';

const STATUS_MAP: Record<string, string> = {
  PICKED_UP: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
};

/**
 * Rider webhook / external delivery: sync orders_core + orders_food and credit merchant wallet.
 */
export async function finalizePartnerOrderDelivered(
  db: SupabaseClient,
  input: {
    orderIdText: string;
    status: string;
    riderId?: string | number | null;
  }
): Promise<{ ok: boolean; credited?: boolean; error?: string }> {
  const orderText = String(input.orderIdText ?? '').trim();
  const mappedStatus = STATUS_MAP[String(input.status ?? '').toUpperCase()];
  if (!orderText || !mappedStatus) {
    return { ok: false, error: 'invalid_input' };
  }

  const { data: core, error: coreErr } = await db
    .from('orders_core')
    .select('id, merchant_store_id, status, current_status')
    .eq('order_id', orderText)
    .maybeSingle();

  if (coreErr || !core?.id || !core.merchant_store_id) {
    return { ok: false, error: 'order_not_found' };
  }

  const { data: food, error: foodErr } = await db
    .from('orders_food')
    .select('id, order_status, order_id')
    .eq('order_id', core.id)
    .maybeSingle();

  if (foodErr || !food?.id) {
    return { ok: false, error: 'food_order_not_found' };
  }

  const now = new Date().toISOString();
  const prevStatus = String(food.order_status ?? 'OUT_FOR_DELIVERY');
  const foodUpdates: Record<string, unknown> = { updated_at: now };

  if (mappedStatus === 'OUT_FOR_DELIVERY') {
    foodUpdates.order_status = 'OUT_FOR_DELIVERY';
    foodUpdates.dispatched_at = now;
  }

  if (mappedStatus === 'DELIVERED') {
    foodUpdates.order_status = 'DELIVERED';
    foodUpdates.delivered_at = now;
  }

  await db.from('orders_food').update(foodUpdates).eq('id', food.id);

  if (mappedStatus === 'DELIVERED') {
    await db
      .from('orders_core')
      .update({
        status: 'delivered',
        current_status: 'Delivered',
        actual_delivery_time: now,
        updated_at: now,
      })
      .eq('id', core.id);
  } else if (mappedStatus === 'OUT_FOR_DELIVERY') {
    await db
      .from('orders_core')
      .update({
        status: 'out_for_delivery',
        current_status: 'Out for delivery',
        updated_at: now,
      })
      .eq('id', core.id);
  }

  if (mappedStatus !== 'DELIVERED') {
    return { ok: true, credited: false };
  }

  let amount = await resolveMerchantWalletCreditAmount(db, {
    ordersCoreId: core.id,
    ordersFoodId: food.id,
    storeId: core.merchant_store_id,
  });

  if (amount <= 0) {
    const computed = await computeMerchantCtmForPartnerOrder(
      db,
      core.id,
      core.merchant_store_id
    );
    if (computed != null && computed > 0) {
      await db.from('orders_core').update({ total_ctm: computed, updated_at: now }).eq('id', core.id);
      await db
        .from('orders_food')
        .update({ food_items_total_value: computed, updated_at: now })
        .eq('id', food.id);
      amount = computed;
    }
  }

  if (amount <= 0) {
    return { ok: true, credited: false, error: 'zero_ctm' };
  }

  const credit = await creditMerchantOrderEarningOnDelivered(db, {
    merchantStoreId: core.merchant_store_id,
    ordersFoodId: food.id,
    ordersCoreId: core.id,
    amount,
    newStatus: 'DELIVERED',
    previousStatus: prevStatus.toUpperCase() === 'DELIVERED' ? 'OUT_FOR_DELIVERY' : prevStatus,
  });

  return { ok: true, credited: credit.credited, error: credit.error };
}
