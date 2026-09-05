/**
 * Merchant wallet ledger on order cancellation — debit clawback or informational row.
 * Keep in sync with dashboard/src/lib/orders/apply-merchant-cancellation-debit.ts
 */
import type { Sql } from "postgres";
import { getSql } from "../db/client.js";
import { resolveCancelledByBrandForLedger } from "./merchant-cancellation-ledger-brand.js";
import {
  compensationMetadataForLedger,
  planMerchantCancellationLedger,
} from "./merchant-cancellation-compensation-service.js";
import { buildCancellationInfoLedgerDescription } from "./merchant-cancellation-compensation-display.js";
import {
  adminCancellationLedgerMetadata,
  COMPENSATION_CREDIT_REASON,
  COMPENSATION_RECOVERY_REASON,
  inspectOrderCtmLedgerState,
  isNoDebitMerchantMode,
  merchantCtmAdjustmentIdempotencyKey,
  normalizeMerchantDebitMode,
  orderHasPayoutCredited,
  resolveCancellationPayoutScenario,
  resolveMerchantCtmDebitAdjustment,
  type MerchantDebitMode,
} from "./merchant-cancellation-wallet-action.js";

export type { MerchantDebitMode };

export type ApplyMerchantOrderCancellationLedgerInput = {
  orderCoreId: number;
  merchantDebit?: string | null;
  partialAmount?: number | null;
  actorSystemUserId?: number | null;
  source: string;
  cancelledByType?: string | null;
  cancelledByLabel?: string | null;
};

export type ApplyMerchantOrderCancellationLedgerResult = {
  applied: boolean;
  recorded?: boolean;
  entryType?: "debit" | "info" | "credit";
  skipped?: string;
  amount?: number;
  ledgerId?: number;
  mode?: MerchantDebitMode;
  ctmAmount?: number;
  ctmAlreadyCredited?: boolean;
  amountAdjusted?: number;
  adjustmentType?: "NONE" | "CREDIT" | "DEBIT";
  status?: "COMPLETED" | "FAILED";
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const normalizeMode = normalizeMerchantDebitMode;

function isRelationMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist|invalid input value for enum/i.test(msg);
}

async function syncCancellationSettlementBreakdown(
  sql: Sql,
  orderCoreId: number
): Promise<void> {
  try {
    await sql`
      SELECT public.sync_order_settlement_cancellation_compensation(${orderCoreId}::bigint)
    `;
  } catch (e) {
    if (!isRelationMissingError(e)) {
      console.warn("[syncCancellationSettlementBreakdown]", orderCoreId, e);
    }
  }
}

async function resolveOrderWalletContext(
  sql: Sql,
  orderCoreId: number
): Promise<{ merchantStoreId: number; ordersFoodId: number } | null> {
  const rows = await sql<
    {
      merchant_store_id: number | null;
      food_store_id: number | null;
      orders_food_id: number | null;
    }[]
  >`
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
  sql: Sql,
  args: { orderCoreId: number; ordersFoodId: number }
): Promise<number> {
  // Prefer OSB merchant_gross (v2 = merchant_settlement_ctm) so cancel matches delivery.
  try {
    const osbRows = await sql<{ merchant_gross: string | null }[]>`
      SELECT merchant_gross::text
      FROM order_settlement_breakdown
      WHERE order_id = ${args.orderCoreId}
      LIMIT 1
    `;
    const fromOsb = Number(osbRows[0]?.merchant_gross ?? 0);
    if (Number.isFinite(fromOsb) && fromOsb > 0) return round2(fromOsb);
  } catch {
    /* pre-0380 schemas */
  }

  const rows = await sql<{ total_ctm: string | null; food_items_total_value: string | null }[]>`
    SELECT c.total_ctm::text, f.food_items_total_value::text
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ${args.orderCoreId}
    LIMIT 1
  `;
  const row = rows[0];
  const frozenCtm = Number(row?.total_ctm ?? 0);
  const foodItemsTotal = Number(row?.food_items_total_value ?? 0);
  const frozen =
    Number.isFinite(frozenCtm) && frozenCtm > 0
      ? frozenCtm
      : Number.isFinite(foodItemsTotal) && foodItemsTotal > 0
        ? foodItemsTotal
        : 0;
  return round2(frozen);
}

async function resolveFormattedOrderId(sql: Sql, orderCoreId: number): Promise<string | null> {
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
  sql: Sql,
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
        OR idempotency_key = ${`merchant_cancel_comp_credit:${orderCoreId}`}
        OR idempotency_key LIKE ${`merchant_ctm_adj:${orderCoreId}:credit:%`}
        OR idempotency_key LIKE ${`merchant_cancel_debit:${orderCoreId}:%`}
        OR idempotency_key LIKE ${`merchant_ctm_adj:${orderCoreId}:debit:%`}
        OR (metadata->>'orders_core_id')::bigint = ${orderCoreId}
      )
      AND COALESCE(metadata->>'balance_impact', '') IS DISTINCT FROM 'none'
      AND UPPER(COALESCE(status, 'COMPLETED')) NOT IN ('FAILED', 'CANCELLED', 'REJECTED', 'PENDING')
    GROUP BY balance_type
    HAVING COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) > 0
    ORDER BY CASE balance_type::text
      WHEN 'LOCKED' THEN 0
      WHEN 'AVAILABLE' THEN 1
      WHEN 'PENDING' THEN 2
      WHEN 'HOLD' THEN 3
      ELSE 4
    END
  `;
  return rows
    .map((r) => ({
      balanceType: String(r.balance_type),
      net: round2(Number(r.net)),
    }))
    .filter((b) => b.net > 0);
}

async function debitFromBucket(
  sql: Sql,
  args: {
    walletId: number;
    amount: number;
    balanceType: string;
    ordersFoodId: number;
    orderCoreId: number;
    mode: MerchantDebitMode;
    idempotencySuffix: string;
    actorSystemUserId?: number | null;
    compensationMeta?: Record<string, unknown>;
  }
): Promise<number | null> {
  if (args.mode === "no_debit") return null;
  const amount = round2(args.amount);
  if (!(amount > 0)) return null;

  const idempotencyKey = `merchant_cancel_debit:${args.orderCoreId}:${args.idempotencySuffix}:${args.balanceType}`;
  const description =
    args.compensationMeta?.admin_override === true
      ? COMPENSATION_RECOVERY_REASON
      : "Order Cancelled — Cancellation Charges Applied";

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
        cancellation_refund: amount,
        customer_compensation: amount,
        actor_system_user_id: args.actorSystemUserId ?? null,
        ...(args.compensationMeta ?? {}),
      })}::text::jsonb
    ) AS ledger_id
  `;
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0 ? ledgerId : null;
}

async function applyWalletDebit(
  sql: Sql,
  args: {
    walletId: number;
    amount: number;
    ordersFoodId: number;
    orderCoreId: number;
    mode: MerchantDebitMode;
    actorSystemUserId?: number | null;
    compensationMeta?: Record<string, unknown>;
  }
): Promise<{ applied: boolean; ledgerId?: number; skipped?: string }> {
  if (args.mode === "no_debit") return { applied: false, skipped: "no_debit" };
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
          idempotencySuffix: `to_target:${args.mode}:${slice}`,
          actorSystemUserId: args.actorSystemUserId,
          compensationMeta: args.compensationMeta,
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

async function applyCompensationCredit(
  sql: Sql,
  args: {
    walletId: number;
    amount: number;
    ordersFoodId: number;
    orderCoreId: number;
    source: string;
    actorSystemUserId?: number | null;
    compensationMeta?: Record<string, unknown>;
    idempotencyKey?: string;
  }
): Promise<{ applied: boolean; ledgerId?: number }> {
  const amount = round2(args.amount);
  if (!(amount > 0)) return { applied: false };

  const idempotencyKey =
    args.idempotencyKey?.trim() ||
    `merchant_cancel_comp_credit:${args.orderCoreId}`;
  const description =
    args.compensationMeta?.admin_override === true
      ? COMPENSATION_CREDIT_REASON
      : "Order Cancelled — Compensation Credit";

  const existing = await sql<{ id: number }[]>`
    SELECT id::int AS id
    FROM merchant_wallet_ledger
    WHERE idempotency_key = ${idempotencyKey}
    LIMIT 1
  `;
  const existingId = Number(existing[0]?.id);
  if (Number.isFinite(existingId) && existingId > 0) {
    return { applied: true, ledgerId: existingId };
  }

  const rows = await sql<{ ledger_id: number | null }[]>`
    SELECT merchant_wallet_credit(
      ${args.walletId}::bigint,
      ${amount}::numeric,
      'ORDER_ADJUSTMENT'::wallet_transaction_category,
      'AVAILABLE'::wallet_balance_type,
      'ORDER'::wallet_reference_type,
      ${args.ordersFoodId}::bigint,
      ${idempotencyKey}::text,
      ${description}::text,
      ${JSON.stringify({
        orders_core_id: args.orderCoreId,
        entry_type: "order_cancellation",
        balance_impact: "credit",
        merchant_keeps_amount: amount,
        trigger_source: args.source,
        actor_system_user_id: args.actorSystemUserId ?? null,
        fulfillment_status: "REJECTED",
        order_status: "CANCELLED",
        ...(args.compensationMeta ?? {}),
      })}::text::jsonb
    ) AS ledger_id
  `;
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0
    ? { applied: true, ledgerId }
    : { applied: false };
}

async function hasCancellationLedgerEntry(
  sql: Sql,
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
          OR idempotency_key = ${`merchant_cancel_comp_credit:${orderCoreId}`}
          OR idempotency_key LIKE ${`merchant_cancel_debit:${orderCoreId}:%`}
          OR (metadata->>'entry_type') = 'order_cancellation'
        )
    ) AS found
  `;
  return Boolean(rows[0]?.found);
}

async function recordCancellationInfoLedger(
  sql: Sql,
  args: {
    walletId: number;
    ordersFoodId: number;
    orderCoreId: number;
    amount: number;
    balanceImpact: "none" | "debit";
    source: string;
    actorSystemUserId?: number | null;
    cancelledByType?: string | null;
    cancelledByLabel?: string | null;
    compensationMeta?: Record<string, unknown>;
  }
): Promise<number | null> {
  if (isNoDebitMerchantMode(String(args.compensationMeta?.merchant_debit_mode ?? ""))) {
    return null;
  }
  const amount = round2(args.amount);
  if (!(amount > 0)) return null;

  const formattedOrderId = (await resolveFormattedOrderId(sql, args.orderCoreId)) ?? `#${args.orderCoreId}`;
  const idempotencyKey = `merchant_cancel_info:${args.orderCoreId}`;
  // Keep both — main's description builder uses compensationMeta (richer
  // wording); CRS's brand resolver produces the ledger row's
  // cancelled_by_brand column downstream at line 506.
  const cancelledByBrand = resolveCancelledByBrandForLedger(
    args.cancelledByType,
    args.cancelledByLabel,
    args.source
  );
  const description = buildCancellationInfoLedgerDescription({
    formattedOrderId,
    balanceImpact: args.balanceImpact,
    compensationMeta: args.compensationMeta,
  });

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
            cancelled_by_type: args.cancelledByType ?? null,
            cancelled_by_label: args.cancelledByLabel ?? null,
            cancelled_by_brand: cancelledByBrand,
            ...(args.compensationMeta ?? {}),
          })}::text::jsonb
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

/**
 * Canonical target-net CTM accounting (admin + engine-auto).
 * A cancellation compensation/info ledger row does NOT mean CTM target is met.
 */
async function applyCanonicalCtmCancellationLedger(
  sql: Sql,
  input: ApplyMerchantOrderCancellationLedgerInput,
  mode: MerchantDebitMode,
  options?: { adminOverride?: boolean }
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
  const adminOverride = options?.adminOverride !== false;
  const ctx = await resolveOrderWalletContext(sql, input.orderCoreId);
  if (!ctx) return { applied: false, skipped: "merchant_not_found", status: "FAILED" };

  const ctmTotal = await resolveMerchantCtmAmount(sql, {
    orderCoreId: input.orderCoreId,
    ordersFoodId: ctx.ordersFoodId,
  });
  if (!(ctmTotal > 0)) {
    return {
      applied: false,
      skipped: "zero_ctm",
      ctmAmount: 0,
      amountAdjusted: 0,
      adjustmentType: "NONE",
      status: "COMPLETED",
      mode,
    };
  }

  const walletRows = await sql<{ wallet_id: number | string }[]>`
    SELECT get_or_create_merchant_wallet(${ctx.merchantStoreId}::bigint) AS wallet_id
  `;
  const walletId = Number(walletRows[0]?.wallet_id);
  if (!Number.isFinite(walletId) || walletId <= 0) {
    return { applied: false, skipped: "wallet_not_found", status: "FAILED", mode };
  }

  const ctmState = await inspectOrderCtmLedgerState(
    sql,
    walletId,
    ctx.ordersFoodId,
    input.orderCoreId
  );
  const hasPayout =
    ctmState.earningCredited > 0.009 ||
    (await orderHasPayoutCredited(sql, walletId, ctx.ordersFoodId, input.orderCoreId));
  const scenario = resolveCancellationPayoutScenario(
    hasPayout || ctmState.grossCredited > 0.009
  );
  const adj = resolveMerchantCtmDebitAdjustment({
    mode,
    ctmAmount: ctmTotal,
    currentNetHeld: ctmState.netHeld,
    grossCredited: ctmState.grossCredited,
  });

  const compensationMeta = {
    ...adminCancellationLedgerMetadata({
      action: adj,
      mode,
      scenario,
      orderCoreId: input.orderCoreId,
      eligibleAmount: ctmTotal,
      source: input.source,
      actorSystemUserId: input.actorSystemUserId,
      extra: {
        current_net_held: ctmState.netHeld,
        target_net: adj.targetNet,
        gross_credited: ctmState.grossCredited,
        already_reversed: ctmState.reversed,
        compensation_credited: ctmState.compensationCredited,
        earning_credited: ctmState.earningCredited,
      },
    }),
    admin_override: adminOverride,
  };

  if (adj.kind === "none") {
    await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
    return {
      applied: true,
      recorded: true,
      amount: 0,
      amountAdjusted: 0,
      adjustmentType: "NONE",
      entryType: "info",
      skipped: "no_adjustment",
      mode,
      ctmAmount: ctmTotal,
      ctmAlreadyCredited: adj.ctmAlreadyCredited,
      status: "COMPLETED",
    };
  }

  if (adj.kind === "credit") {
    const creditResult = await applyCompensationCredit(sql, {
      walletId,
      amount: adj.amount,
      ordersFoodId: ctx.ordersFoodId,
      orderCoreId: input.orderCoreId,
      source: input.source,
      actorSystemUserId: input.actorSystemUserId,
      compensationMeta,
      idempotencyKey: merchantCtmAdjustmentIdempotencyKey(
        input.orderCoreId,
        "credit",
        adj.targetNet
      ),
    });
    if (creditResult.applied) {
      await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
      return {
        applied: true,
        recorded: true,
        amount: adj.amount,
        amountAdjusted: adj.amount,
        adjustmentType: "CREDIT",
        ledgerId: creditResult.ledgerId,
        entryType: "credit",
        mode,
        ctmAmount: ctmTotal,
        ctmAlreadyCredited: adj.ctmAlreadyCredited,
        status: "COMPLETED",
      };
    }
    return {
      applied: false,
      skipped: "credit_failed",
      mode,
      ctmAmount: ctmTotal,
      ctmAlreadyCredited: adj.ctmAlreadyCredited,
      amountAdjusted: 0,
      adjustmentType: "NONE",
      status: "FAILED",
    };
  }

  const debitResult = await applyWalletDebit(sql, {
    walletId,
    amount: adj.amount,
    ordersFoodId: ctx.ordersFoodId,
    orderCoreId: input.orderCoreId,
    mode,
    actorSystemUserId: input.actorSystemUserId,
    compensationMeta,
  });
  if (debitResult.applied) {
    await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
    return {
      applied: true,
      recorded: true,
      amount: adj.amount,
      amountAdjusted: adj.amount,
      adjustmentType: "DEBIT",
      ledgerId: debitResult.ledgerId,
      entryType: "debit",
      mode,
      ctmAmount: ctmTotal,
      ctmAlreadyCredited: adj.ctmAlreadyCredited,
      status: "COMPLETED",
      skipped: debitResult.skipped,
    };
  }

  return {
    applied: true,
    recorded: true,
    amount: 0,
    amountAdjusted: 0,
    adjustmentType: "NONE",
    entryType: "info",
    skipped: debitResult.skipped ?? "not_yet_credited",
    mode,
    ctmAmount: ctmTotal,
    ctmAlreadyCredited: adj.ctmAlreadyCredited,
    status: "COMPLETED",
  };
}

export async function applyMerchantOrderCancellationLedger(
  input: ApplyMerchantOrderCancellationLedgerInput,
  sql: Sql = getSql()
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
  if (!Number.isFinite(input.orderCoreId) || input.orderCoreId <= 0) {
    return { applied: false, skipped: "invalid_order" };
  }

  const explicitMode = normalizeMode(input.merchantDebit);
  if (explicitMode) {
    try {
      return await applyCanonicalCtmCancellationLedger(sql, input, explicitMode, {
        adminOverride: true,
      });
    } catch (e) {
      if (isRelationMissingError(e)) {
        return { applied: false, skipped: "merchant_wallet_not_migrated" };
      }
      console.error("[applyMerchantOrderCancellationLedger/admin]", e);
      throw e;
    }
  }

  try {
    const plan = await planMerchantCancellationLedger(
      sql,
      input.orderCoreId,
      input.merchantDebit
    );

    const effectiveInput =
      plan.merchantDebit && !input.merchantDebit?.trim()
        ? {
            ...input,
            merchantDebit: plan.merchantDebit,
            partialAmount: plan.partialAmount ?? input.partialAmount,
          }
        : input;

    // Engine-auto with resolved mode → same canonical CTM path (no hasCancellation early-exit).
    const engineMode = normalizeMode(effectiveInput.merchantDebit);
    if (engineMode) {
      return await applyCanonicalCtmCancellationLedger(sql, effectiveInput, engineMode, {
        adminOverride: false,
      });
    }

    // No debit mode — informational only; hasCancellation only blocks duplicate info rows.
    const compensationMeta = compensationMetadataForLedger(plan.resolved, plan.display);
    const engineAuto = !input.merchantDebit?.trim();
    const merchantKeepsAmount = round2(plan.resolved?.merchantKeepsAmount ?? 0);

    const ctx = await resolveOrderWalletContext(sql, input.orderCoreId);
    if (!ctx) return { applied: false, skipped: "merchant_not_found" };

    const ctmTotal = await resolveMerchantCtmAmount(sql, {
      orderCoreId: input.orderCoreId,
      ordersFoodId: ctx.ordersFoodId,
    });
    if (!(ctmTotal > 0)) return { applied: false, skipped: "zero_ctm" };

    const walletRows = await sql<{ wallet_id: number | string }[]>`
      SELECT get_or_create_merchant_wallet(${ctx.merchantStoreId}::bigint) AS wallet_id
    `;
    const walletId = Number(walletRows[0]?.wallet_id);
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { applied: false, skipped: "wallet_not_found" };
    }

    if (await hasCancellationLedgerEntry(sql, walletId, ctx.ordersFoodId, input.orderCoreId)) {
      return { applied: true, recorded: true, skipped: "already_recorded", entryType: "info" };
    }

    const infoAmount =
      engineAuto && plan.engineUsed && plan.resolved ? merchantKeepsAmount : ctmTotal;

    const ledgerId = await recordCancellationInfoLedger(sql, {
      walletId,
      ordersFoodId: ctx.ordersFoodId,
      orderCoreId: input.orderCoreId,
      amount: infoAmount > 0 ? infoAmount : ctmTotal,
      balanceImpact: "none",
      source: input.source,
      actorSystemUserId: input.actorSystemUserId,
      cancelledByType: input.cancelledByType,
      cancelledByLabel: input.cancelledByLabel,
      compensationMeta,
    });

    if (ledgerId) {
      await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
      return {
        applied: true,
        recorded: true,
        amount: infoAmount > 0 ? infoAmount : ctmTotal,
        ledgerId,
        entryType: "info",
        skipped: "no_mode",
      };
    }

    return { applied: false, recorded: false, skipped: "info_not_recorded" };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return { applied: false, skipped: "merchant_wallet_not_migrated" };
    }
    console.error("[applyMerchantOrderCancellationLedger]", e);
    throw e;
  }
}
