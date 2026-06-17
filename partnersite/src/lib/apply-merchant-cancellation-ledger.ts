/**
 * Merchant wallet ledger on order cancellation — debit clawback or informational row.
 * Keep in sync with dashboard/src/lib/orders/apply-merchant-cancellation-debit.ts
 */
import type postgres from "postgres";
import { client as pgClient } from "@/lib/drizzle";

export type MerchantDebitMode = "full_debit" | "partial_debit" | "no_debit";

export type ApplyMerchantOrderCancellationLedgerInput = {
  orderCoreId: number;
  merchantDebit?: string | null;
  partialAmount?: number | null;
  actorSystemUserId?: number | null;
  source: string;
};

export type ApplyMerchantOrderCancellationLedgerResult = {
  applied: boolean;
  recorded?: boolean;
  entryType?: "debit" | "info";
  skipped?: string;
  amount?: number;
  ledgerId?: number;
  mode?: MerchantDebitMode;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeMode(raw: string | null | undefined): MerchantDebitMode | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "full_debit" || v === "partial_debit" || v === "no_debit") return v;
  return null;
}

function isRelationMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist|invalid input value for enum/i.test(msg);
}

async function resolveOrderWalletContext(
  sql: postgres.Sql,
  orderCoreId: number
): Promise<{ merchantStoreId: number; ordersFoodId: number } | null> {
  const rows = await sql<{ merchant_store_id: number | null; food_store_id: number | null; orders_food_id: number | null }[]>`
    SELECT
      c.merchant_store_id,
      f.merchant_store_id AS food_store_id,
      f.id AS orders_food_id
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0];
  const merchantStoreId = Number(row?.food_store_id ?? row?.merchant_store_id);
  const ordersFoodId = Number(row?.orders_food_id);
  if (!Number.isFinite(merchantStoreId) || merchantStoreId <= 0) return null;
  if (!Number.isFinite(ordersFoodId) || ordersFoodId <= 0) return null;
  return { merchantStoreId, ordersFoodId };
}

async function resolveMerchantCtmAmount(
  sql: postgres.Sql,
  args: { orderCoreId: number }
): Promise<number> {
  const rows = await sql<{ total_ctm: string | null; food_items_total_value: string | null }[]>`
    SELECT c.total_ctm::text, f.food_items_total_value::text
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ${args.orderCoreId}
    LIMIT 1
  `;
  const row = rows[0];
  const frozen = Number(row?.total_ctm ?? row?.food_items_total_value ?? 0);
  return round2(Math.max(0, Number.isFinite(frozen) ? frozen : 0));
}

async function resolveFormattedOrderId(sql: postgres.Sql, orderCoreId: number): Promise<string | null> {
  const rows = await sql<{ formatted_order_id: string | null; order_id: string | null }[]>`
    SELECT formatted_order_id, order_id::text
    FROM orders_core
    WHERE id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0];
  return row?.formatted_order_id?.trim() || row?.order_id?.trim() || null;
}

type BucketNet = { balanceType: string; net: number };

async function resolveOrderCreditBuckets(
  sql: postgres.Sql,
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<BucketNet[]> {
  const rows = await sql<{ balance_type: string; net: string }[]>`
    SELECT
      balance_type::text AS balance_type,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text AS net
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND reference_type = 'ORDER'::wallet_reference_type
      AND (
        reference_id = ${ordersFoodId}
        OR idempotency_key = ${`order_earning_${ordersFoodId}`}
        OR idempotency_key = ${`settle:order:${orderCoreId}`}
        OR (metadata->>'orders_core_id')::bigint = ${orderCoreId}
      )
    GROUP BY balance_type
    HAVING COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) > 0
  `;
  return rows
    .map((r) => ({
      balanceType: String(r.balance_type),
      net: round2(Number(r.net)),
    }))
    .filter((b) => b.net > 0);
}

async function debitFromBucket(
  sql: postgres.Sql,
  args: {
    walletId: number;
    amount: number;
    balanceType: string;
    ordersFoodId: number;
    orderCoreId: number;
    mode: MerchantDebitMode;
    idempotencySuffix: string;
    actorSystemUserId?: number | null;
  }
): Promise<number | null> {
  const amount = round2(args.amount);
  if (!(amount > 0)) return null;

  const idempotencyKey = `merchant_cancel_debit:${args.orderCoreId}:${args.idempotencySuffix}:${args.balanceType}`;
  const description = "Order Cancelled — Cancellation Charges Applied";

  const rows = await sql<{ ledger_id: number | null }[]>`
    SELECT merchant_wallet_debit(
      ${args.walletId}::bigint,
      ${amount}::numeric,
      'ORDER_ADJUSTMENT'::wallet_transaction_category,
      ${args.balanceType}::wallet_balance_type,
      'ORDER'::wallet_reference_type,
      ${args.ordersFoodId}::bigint,
      ${idempotencyKey}::text,
      ${description}::text,
      ${JSON.stringify({
        orders_core_id: args.orderCoreId,
        merchant_debit_mode: args.mode,
        trigger_source: args.idempotencySuffix,
        entry_type: "order_cancellation",
        balance_impact: "debit",
        actor_system_user_id: args.actorSystemUserId ?? null,
      })}::jsonb
    ) AS ledger_id
  `;
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0 ? ledgerId : null;
}

async function applyWalletDebit(
  sql: postgres.Sql,
  args: {
    walletId: number;
    amount: number;
    ordersFoodId: number;
    orderCoreId: number;
    mode: MerchantDebitMode;
    actorSystemUserId?: number | null;
  }
): Promise<{ applied: boolean; ledgerId?: number; skipped?: string }> {
  const target = round2(args.amount);
  if (!(target > 0)) return { applied: false, skipped: "zero_amount" };

  const buckets = await resolveOrderCreditBuckets(sql, args.walletId, args.ordersFoodId, args.orderCoreId);
  let remaining = target;
  let lastLedgerId: number | undefined;

  if (buckets.length > 0) {
    for (const bucket of buckets) {
      if (remaining <= 0) break;
      const slice = round2(Math.min(remaining, bucket.net));
      if (!(slice > 0)) continue;
      try {
        const ledgerId = await debitFromBucket(sql, {
          walletId: args.walletId,
          amount: slice,
          balanceType: bucket.balanceType,
          ordersFoodId: args.ordersFoodId,
          orderCoreId: args.orderCoreId,
          mode: args.mode,
          idempotencySuffix: `${args.mode}:${slice}`,
          actorSystemUserId: args.actorSystemUserId,
        });
        if (ledgerId) {
          lastLedgerId = ledgerId;
          remaining = round2(remaining - slice);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/insufficient/i.test(msg)) throw e;
      }
    }
    if (remaining <= 0.009) {
      return { applied: true, ledgerId: lastLedgerId };
    }
    return lastLedgerId
      ? { applied: true, ledgerId: lastLedgerId, skipped: "partial_bucket_debit" }
      : { applied: false, skipped: "not_yet_credited" };
  }

  return { applied: false, skipped: "not_yet_credited" };
}

async function applyMerchantCancellationDebit(
  sql: postgres.Sql,
  input: ApplyMerchantOrderCancellationLedgerInput
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
  const mode = normalizeMode(input.merchantDebit);
  if (!mode || mode === "no_debit") {
    return { applied: false, skipped: "no_debit" };
  }

  const ctx = await resolveOrderWalletContext(sql, input.orderCoreId);
  if (!ctx) return { applied: false, skipped: "merchant_not_found" };

  const ctmTotal = await resolveMerchantCtmAmount(sql, { orderCoreId: input.orderCoreId });
  if (!(ctmTotal > 0)) return { applied: false, skipped: "zero_ctm" };

  let debitAmount = 0;
  if (mode === "full_debit") {
    debitAmount = ctmTotal;
  } else {
    const partial = Number(input.partialAmount);
    if (Number.isFinite(partial) && partial > 0) {
      debitAmount = round2(Math.min(partial, ctmTotal));
    } else {
      return { applied: false, skipped: "partial_amount_required" };
    }
  }

  const walletRows = await sql<{ wallet_id: number | string }[]>`
    SELECT get_or_create_merchant_wallet(${ctx.merchantStoreId}::bigint) AS wallet_id
  `;
  const walletId = Number(walletRows[0]?.wallet_id);
  if (!Number.isFinite(walletId) || walletId <= 0) {
    return { applied: false, skipped: "wallet_not_found" };
  }

  const result = await applyWalletDebit(sql, {
    walletId,
    amount: debitAmount,
    ordersFoodId: ctx.ordersFoodId,
    orderCoreId: input.orderCoreId,
    mode,
    actorSystemUserId: input.actorSystemUserId,
  });

  return {
    applied: result.applied,
    skipped: result.skipped,
    amount: result.applied ? debitAmount : undefined,
    ledgerId: result.ledgerId,
    mode,
    entryType: result.applied ? "debit" : undefined,
  };
}

async function hasCancellationLedgerEntry(
  sql: postgres.Sql,
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<boolean> {
  const rows = await sql<{ found: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM merchant_wallet_ledger
      WHERE wallet_id = ${walletId}
        AND reference_type = 'ORDER'::wallet_reference_type
        AND reference_id = ${ordersFoodId}
        AND (
          idempotency_key = ${`merchant_cancel_info:${orderCoreId}`}
          OR idempotency_key LIKE ${`merchant_cancel_debit:${orderCoreId}:%`}
          OR (metadata->>'entry_type') = 'order_cancellation'
        )
    ) AS found
  `;
  return Boolean(rows[0]?.found);
}

async function recordCancellationInfoLedger(
  sql: postgres.Sql,
  args: {
    walletId: number;
    ordersFoodId: number;
    orderCoreId: number;
    amount: number;
    balanceImpact: "none" | "debit";
    source: string;
    actorSystemUserId?: number | null;
  }
): Promise<number | null> {
  const amount = round2(args.amount);
  if (!(amount > 0)) return null;

  const formattedOrderId = (await resolveFormattedOrderId(sql, args.orderCoreId)) ?? `#${args.orderCoreId}`;
  const idempotencyKey = `merchant_cancel_info:${args.orderCoreId}`;
  const description =
    args.balanceImpact === "none"
      ? `Order ${formattedOrderId} cancelled — no merchant credit`
      : `Order ${formattedOrderId} cancelled`;

  const rows = await sql<{ ledger_id: number | null }[]>`
    WITH w AS (
      SELECT
        id,
        available_balance,
        available_balance AS withdrawable_balance
      FROM merchant_wallet
      WHERE id = ${args.walletId}
      FOR UPDATE
    ),
    ins AS (
      INSERT INTO merchant_wallet_ledger (
        wallet_id, direction, category, balance_type, amount,
        balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, metadata, order_id, status
      )
      SELECT
        w.id,
        'DEBIT',
        'ORDER_ADJUSTMENT'::wallet_transaction_category,
        'AVAILABLE'::wallet_balance_type,
        ${amount}::numeric,
        w.available_balance,
        w.available_balance,
        'ORDER'::wallet_reference_type,
        ${args.ordersFoodId}::bigint,
        ${idempotencyKey}::text,
        ${description}::text,
        (
          ${JSON.stringify({
            entry_type: "order_cancellation",
            balance_impact: args.balanceImpact,
            orders_core_id: args.orderCoreId,
            trigger_source: args.source,
            actor_system_user_id: args.actorSystemUserId ?? null,
          })}::jsonb
          || jsonb_build_object(
            'withdrawable_after', w.withdrawable_balance,
            'available_snapshot', w.available_balance,
            'locked_snapshot', 0
          )
        ),
        ${args.orderCoreId}::bigint,
        'COMPLETED'
      FROM w
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    )
    SELECT COALESCE(
      (SELECT id FROM ins LIMIT 1),
      (SELECT id FROM merchant_wallet_ledger WHERE idempotency_key = ${idempotencyKey} LIMIT 1)
    ) AS ledger_id
  `;
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0 ? ledgerId : null;
}

export async function applyMerchantOrderCancellationLedger(
  input: ApplyMerchantOrderCancellationLedgerInput,
  sql: postgres.Sql = pgClient
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
  if (!Number.isFinite(input.orderCoreId) || input.orderCoreId <= 0) {
    return { applied: false, skipped: "invalid_order" };
  }

  try {
    const debitResult = await applyMerchantCancellationDebit(sql, input);
    if (debitResult.applied) {
      return { ...debitResult, recorded: true };
    }

    const ctx = await resolveOrderWalletContext(sql, input.orderCoreId);
    if (!ctx) return { ...debitResult, skipped: debitResult.skipped ?? "merchant_not_found" };

    const ctmTotal = await resolveMerchantCtmAmount(sql, { orderCoreId: input.orderCoreId });
    if (!(ctmTotal > 0)) return { ...debitResult, skipped: debitResult.skipped ?? "zero_ctm" };

    const walletRows = await sql<{ wallet_id: number | string }[]>`
      SELECT get_or_create_merchant_wallet(${ctx.merchantStoreId}::bigint) AS wallet_id
    `;
    const walletId = Number(walletRows[0]?.wallet_id);
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { ...debitResult, skipped: debitResult.skipped ?? "wallet_not_found" };
    }

    if (await hasCancellationLedgerEntry(sql, walletId, ctx.ordersFoodId, input.orderCoreId)) {
      return { applied: true, recorded: true, skipped: "already_recorded", entryType: "info" };
    }

    const balanceImpact =
      debitResult.skipped === "not_yet_credited" || debitResult.skipped === "no_debit"
        ? "none"
        : "debit";

    const ledgerId = await recordCancellationInfoLedger(sql, {
      walletId,
      ordersFoodId: ctx.ordersFoodId,
      orderCoreId: input.orderCoreId,
      amount: ctmTotal,
      balanceImpact,
      source: input.source,
      actorSystemUserId: input.actorSystemUserId,
    });

    if (ledgerId) {
      return {
        applied: true,
        recorded: true,
        amount: ctmTotal,
        ledgerId,
        entryType: "info",
        skipped: debitResult.skipped,
      };
    }

    return { ...debitResult, recorded: false };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return { applied: false, skipped: "merchant_wallet_not_migrated" };
    }
    console.error("[applyMerchantOrderCancellationLedger]", e);
    throw e;
  }
}
