import type { Sql } from "postgres";
import { creditMerchantOrderEarningOnDelivered } from "./credit-merchant-order-on-delivered.js";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Credit wallet for delivered orders missing ORDER_EARNING (e.g. delivered outside merchant PATCH).
 * Idempotent via settlement idempotency key settle:order:{coreId}.
 */
export async function backfillMissingDeliveredOrderCredits(
  sql: Sql,
  merchantStoreId: number,
  limit = 40
): Promise<{ credited: number; skipped: number }> {
  const rows = await sql<
    Array<{ id: number; order_id: number; order_status: string | null }>
  >`
    SELECT id, order_id, order_status
    FROM orders_food
    WHERE merchant_store_id = ${merchantStoreId}
      AND UPPER(COALESCE(order_status, '')) = 'DELIVERED'
    ORDER BY delivered_at DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return { credited: 0, skipped: 0 };

  let credited = 0;
  let skipped = 0;

  for (const row of rows) {
    const ordersFoodId = Number(row.id);
    const ordersCoreId = Number(row.order_id);
    if (!Number.isFinite(ordersFoodId) || !Number.isFinite(ordersCoreId)) {
      skipped += 1;
      continue;
    }

    const existing = await sql`
      SELECT id
      FROM merchant_wallet_ledger
      WHERE reference_type = 'ORDER'
        AND reference_id = ${ordersFoodId}
        AND category = 'ORDER_EARNING'
      LIMIT 1
    `;
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    let amount = 0;
    const foodRows = await sql<{ food_items_total_value: unknown }[]>`
      SELECT food_items_total_value FROM orders_food WHERE id = ${ordersFoodId} LIMIT 1
    `;
    amount = num(foodRows[0]?.food_items_total_value);

    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const result = await creditMerchantOrderEarningOnDelivered({
      merchantStoreId,
      ordersFoodId,
      ordersCoreId,
      amount,
      newStatus: "DELIVERED",
      previousStatus: "OUT_FOR_DELIVERY",
    });

    if (result.credited) credited += 1;
    else skipped += 1;
  }

  return { credited, skipped };
}

/**
 * Record ledger rows for cancelled orders that never got a cancellation entry (e.g. GMF100012).
 */
export async function backfillMissingCancelledOrderLedger(
  sql: Sql,
  merchantStoreId: number,
  limit = 40
): Promise<{ recorded: number; skipped: number }> {
  const { applyMerchantOrderCancellationLedger } = await import(
    "./apply-merchant-cancellation-ledger.js"
  );

  const rows = await sql<
    Array<{ orders_food_id: number; order_core_id: number }>
  >`
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
            l.idempotency_key = ('merchant_cancel_info:' || f.order_id::text)
            OR l.idempotency_key = ('merchant_cancel_comp_credit:' || f.order_id::text)
            OR l.idempotency_key LIKE ('merchant_cancel_debit:' || f.order_id::text || ':%')
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
    const result = await applyMerchantOrderCancellationLedger(
      { orderCoreId, source: "backfill_cancelled_ledger" },
      sql
    );
    if (result.recorded || result.applied) recorded += 1;
    else skipped += 1;
  }

  return { recorded, skipped };
}

export async function repairCancellationLedgerWithdrawableMetadata(
  sql: Sql,
  walletId: number
): Promise<{ repaired: number }> {
  const bucketRows = await sql<
    {
      id: number;
      balance_type: string | null;
      balance_after: string | number | null;
      amount: string | number | null;
      direction: string | null;
      created_at: Date | string;
      metadata: Record<string, unknown> | null;
    }[]
  >`
    SELECT id, balance_type, balance_after, amount, direction, created_at, metadata
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
    ORDER BY created_at ASC, id ASC
    LIMIT 5000
  `;

  if (!bucketRows.length) return { repaired: 0 };

  const { buildWithdrawableBalanceByLedgerId } = await import("./merchant-wallet-ledger-display.js");
  const withdrawableById = buildWithdrawableBalanceByLedgerId(
    bucketRows.map((row) => ({
      id: row.id,
      balance_type: row.balance_type,
      balance_after: row.balance_after != null ? Number(row.balance_after) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      direction: row.direction,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      metadata: row.metadata,
    }))
  );

  let repaired = 0;
  for (const row of bucketRows) {
    const meta = row.metadata ?? {};
    if (meta.entry_type !== "order_cancellation" || meta.balance_impact !== "none") continue;
    if (meta.withdrawable_after != null) continue;

    const withdrawable = withdrawableById.get(row.id);
    if (withdrawable == null) continue;

    const nextMeta = {
      ...meta,
      withdrawable_after: withdrawable,
      available_snapshot: Number(row.balance_after ?? meta.available_snapshot ?? 0),
    };

    await sql`
      UPDATE merchant_wallet_ledger
      SET metadata = ${JSON.stringify(nextMeta)}::jsonb
      WHERE id = ${row.id}
    `;
    repaired += 1;
  }

  return { repaired };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reverse cancellation debits that wrongly reduced wallet when the order was never
 * credited (no ORDER_EARNING). Idempotent via repair_cancel_debit_reversal:{coreId}.
 */
export async function repairErroneousZeroCompensationCancellationDebits(
  sql: Sql,
  merchantStoreId: number,
  limit = 20
): Promise<{ reversed: number; skipped: number }> {
  const walletRows = await sql<{ id: number }[]>`
    SELECT id FROM merchant_wallet WHERE merchant_store_id = ${merchantStoreId} LIMIT 1
  `;
  const walletId = Number(walletRows[0]?.id);
  if (!Number.isFinite(walletId) || walletId <= 0) return { reversed: 0, skipped: 0 };

  const debits = await sql<
    {
      id: number;
      amount: string;
      reference_id: number;
      orders_core_id: number;
    }[]
  >`
    SELECT
      l.id,
      l.amount::text,
      l.reference_id,
      COALESCE(
        NULLIF((l.metadata->>'orders_core_id')::bigint, 0),
        NULLIF(l.order_id, 0)
      ) AS orders_core_id
    FROM merchant_wallet_ledger l
    WHERE l.wallet_id = ${walletId}
      AND l.direction = 'DEBIT'
      AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
      AND COALESCE(l.metadata->>'balance_impact', '') = 'debit'
      AND COALESCE(l.metadata->>'reversed_by_repair', '') <> 'true'
      AND NOT EXISTS (
        SELECT 1
        FROM merchant_wallet_ledger e
        WHERE e.wallet_id = l.wallet_id
          AND e.direction = 'CREDIT'
          AND e.category = 'ORDER_EARNING'::wallet_transaction_category
          AND e.reference_id = l.reference_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM merchant_wallet_ledger r
        WHERE r.wallet_id = l.wallet_id
          AND r.idempotency_key = (
            'repair_cancel_debit_reversal:'
            || COALESCE(
              NULLIF((l.metadata->>'orders_core_id')::bigint, 0),
              NULLIF(l.order_id, 0)
            )::text
          )
      )
    ORDER BY l.created_at DESC
    LIMIT ${limit}
  `;

  let reversed = 0;
  let skipped = 0;

  for (const row of debits) {
    const orderCoreId = Number(row.orders_core_id);
    const ordersFoodId = Number(row.reference_id);
    const amount = round2(Number(row.amount));
    if (!Number.isFinite(orderCoreId) || orderCoreId <= 0 || !(amount > 0)) {
      skipped += 1;
      continue;
    }
    if (!Number.isFinite(ordersFoodId) || ordersFoodId <= 0) {
      skipped += 1;
      continue;
    }

    const idempotencyKey = `repair_cancel_debit_reversal:${orderCoreId}`;
    const description = "Cancellation debit reversed — order was not credited to wallet";

    try {
      const creditRows = await sql<{ ledger_id: number | null }[]>`
        SELECT merchant_wallet_credit(
          ${walletId}::bigint,
          ${amount}::numeric,
          'ORDER_ADJUSTMENT'::wallet_transaction_category,
          'AVAILABLE'::wallet_balance_type,
          'ORDER'::wallet_reference_type,
          ${ordersFoodId}::bigint,
          ${idempotencyKey}::text,
          ${description}::text,
          ${JSON.stringify({
            orders_core_id: orderCoreId,
            entry_type: "order_cancellation",
            balance_impact: "credit",
            transaction_type: "COMPENSATION_CREDIT",
            reason: "Erroneous cancellation debit reversal",
            trigger_source: "repair_erroneous_cancel_debit",
            reversed_ledger_id: row.id,
            reversed_amount: amount,
          })}::jsonb
        ) AS ledger_id
      `;
      const ledgerId = Number(creditRows[0]?.ledger_id);
      if (!Number.isFinite(ledgerId) || ledgerId <= 0) {
        skipped += 1;
        continue;
      }

      reversed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/duplicate|idempotency/i.test(msg)) {
        skipped += 1;
        continue;
      }
      console.warn("[repairErroneousZeroCompensationCancellationDebits]", orderCoreId, e);
      skipped += 1;
    }
  }

  return { reversed, skipped };
}
