import type { SupabaseClient } from '@supabase/supabase-js';
import { creditMerchantOrderEarningOnDelivered } from '@/lib/credit-merchant-order-on-delivered';
import { applyMerchantOrderCancellationLedger } from '@/lib/apply-merchant-cancellation-ledger';
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

/** Record ledger for cancelled orders missing a cancellation row (e.g. admin-cancelled before delivery). */
export async function backfillMissingCancelledOrderLedger(
  _db: SupabaseClient,
  merchantStoreId: number,
  limit = 40
): Promise<{ recorded: number; skipped: number }> {
  const { client: sql } = await import('@/lib/drizzle');
  const rows = await sql<{ orders_food_id: number; order_core_id: number }[]>`
    SELECT f.id AS orders_food_id, f.order_id AS order_core_id
    FROM orders_food f
    WHERE f.merchant_store_id = ${merchantStoreId}
      AND UPPER(COALESCE(f.order_status, '')) = 'CANCELLED'
      AND NOT EXISTS (
        SELECT 1
        FROM merchant_wallet_ledger l
        INNER JOIN merchant_wallet w ON w.id = l.wallet_id
        WHERE w.merchant_store_id = ${merchantStoreId}
          AND l.reference_type = 'ORDER'::wallet_reference_type
          AND l.reference_id = f.id
          AND (
            l.idempotency_key = 'merchant_cancel_info:' || f.order_id::text
            OR l.idempotency_key LIKE 'merchant_cancel_debit:' || f.order_id::text || ':%'
            OR (l.metadata->>'entry_type') = 'order_cancellation'
          )
      )
    ORDER BY f.updated_at DESC NULLS LAST, f.id DESC
    LIMIT ${limit}
  `;

  let recorded = 0;
  let skipped = 0;
  for (const row of rows) {
    const orderCoreId = Number(row.order_core_id);
    if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) {
      skipped += 1;
      continue;
    }
    const result = await applyMerchantOrderCancellationLedger({
      orderCoreId,
      source: 'backfill_cancelled_ledger',
    });
    if (result.recorded || result.applied) recorded += 1;
    else skipped += 1;
  }
  return { recorded, skipped };
}

/** Backfill withdrawable_after metadata on informational cancellation ledger rows. */
export async function repairCancellationLedgerWithdrawableMetadata(
  db: SupabaseClient,
  walletId: number
): Promise<{ repaired: number }> {
  const { data: bucketRows } = await db
    .from('merchant_wallet_ledger')
    .select('id, balance_type, balance_after, amount, direction, created_at, metadata')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(5000);

  if (!bucketRows?.length) return { repaired: 0 };

  const { buildWithdrawableBalanceByLedgerId } = await import('@/lib/merchant-wallet-ledger-display');
  const withdrawableById = buildWithdrawableBalanceByLedgerId(
    bucketRows.map((row) => ({
      id: row.id as number,
      balance_type: row.balance_type as string | null,
      balance_after: row.balance_after != null ? Number(row.balance_after) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      direction: row.direction as string | null,
      created_at: row.created_at as string,
      metadata: row.metadata as Record<string, unknown> | null,
    }))
  );

  let repaired = 0;
  for (const row of bucketRows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.entry_type !== 'order_cancellation' || meta.balance_impact !== 'none') continue;
    if (meta.withdrawable_after != null) continue;

    const withdrawable = withdrawableById.get(row.id as number);
    if (withdrawable == null) continue;

    const nextMeta = {
      ...meta,
      withdrawable_after: withdrawable,
      available_snapshot: Number(row.balance_after ?? meta.available_snapshot ?? 0),
    };

    const { error } = await db
      .from('merchant_wallet_ledger')
      .update({ metadata: nextMeta })
      .eq('id', row.id);

    if (!error) repaired += 1;
  }

  return { repaired };
}
