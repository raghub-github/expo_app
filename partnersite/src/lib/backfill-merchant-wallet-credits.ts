import type { SupabaseClient } from '@supabase/supabase-js';
import { creditMerchantOrderEarningOnDelivered } from '@/lib/credit-merchant-order-on-delivered';
import {
  computeMerchantCtmForPartnerOrder,
  resolveMerchantWalletCreditAmount,
} from '@/lib/merchant-order-ctm';

/**
 * Credit wallet for delivered orders that never got ORDER_EARNING (e.g. delivered via dashboard agent status).
 * Idempotent via settlement idempotency key settle:order:{coreId}.
 */
export async function backfillMissingDeliveredOrderCredits(
  db: SupabaseClient,
  merchantStoreId: number,
  limit = 40
): Promise<{ credited: number; skipped: number }> {
  const { data: delivered, error } = await db
    .from('orders_food')
    .select('id, order_id, order_status, delivered_at')
    .eq('merchant_store_id', merchantStoreId)
    .eq('order_status', 'DELIVERED')
    .order('delivered_at', { ascending: false })
    .limit(limit);

  if (error || !delivered?.length) {
    return { credited: 0, skipped: 0 };
  }

  let credited = 0;
  let skipped = 0;

  for (const row of delivered) {
    const ordersFoodId = Number((row as { id: number }).id);
    const ordersCoreId = Number((row as { order_id: number }).order_id);
    if (!Number.isFinite(ordersFoodId) || !Number.isFinite(ordersCoreId)) {
      skipped += 1;
      continue;
    }

    const { data: existing } = await db
      .from('merchant_wallet_ledger')
      .select('id')
      .eq('reference_type', 'ORDER')
      .eq('reference_id', ordersFoodId)
      .eq('category', 'ORDER_EARNING')
      .limit(1)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    let amount = await resolveMerchantWalletCreditAmount(db, {
      ordersCoreId,
      ordersFoodId,
      storeId: merchantStoreId,
    });

    if (amount <= 0) {
      const computed = await computeMerchantCtmForPartnerOrder(
        db,
        ordersCoreId,
        merchantStoreId
      );
      if (computed != null && computed > 0) {
        const now = new Date().toISOString();
        await db
          .from('orders_core')
          .update({ total_ctm: computed, updated_at: now })
          .eq('id', ordersCoreId);
        await db
          .from('orders_food')
          .update({ food_items_total_value: computed, updated_at: now })
          .eq('id', ordersFoodId);
        amount = computed;
      }
    }

    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const result = await creditMerchantOrderEarningOnDelivered(db, {
      merchantStoreId,
      ordersFoodId,
      ordersCoreId,
      amount,
      newStatus: 'DELIVERED',
      previousStatus: 'OUT_FOR_DELIVERY',
    });

    if (result.credited) credited += 1;
    else skipped += 1;
  }

  return { credited, skipped };
}
