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
  normalizeMerchantDebitMode,
  orderHasPayoutCredited,
  resolveAdminCancellationWalletAction,
  resolveCancellationPayoutScenario,
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
        OR (metadata->>'orders_core_id')::bigint = ${orderCoreId}
      )
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
      })}::jsonb
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
  }
): Promise<{ applied: boolean; ledgerId?: number }> {
  const amount = round2(args.amount);
  if (!(amount > 0)) return { applied: false };

  const idempotencyKey = `merchant_cancel_comp_credit:${args.orderCoreId}`;
  const description =
    args.compensationMeta?.admin_override === true
      ? COMPENSATION_CREDIT_REASON
      : "Order Cancelled — Compensation Credit";

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
      })}::jsonb
    ) AS ledger_id
  `;
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0
    ? { applied: true, ledgerId }
    : { applied: false };
}

async function applyMerchantCancellationDebit(
  sql: Sql,
  input: ApplyMerchantOrderCancellationLedgerInput,
  compensationMeta?: Record<string, unknown>
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
  const mode = normalizeMode(input.merchantDebit);
  if (!mode || mode === "no_debit") {
    return { applied: false, skipped: "no_debit" };
  }

  const ctx = await resolveOrderWalletContext(sql, input.orderCoreId);
  if (!ctx) return { applied: false, skipped: "merchant_not_found" };

  const ctmTotal = await resolveMerchantCtmAmount(sql, {
    orderCoreId: input.orderCoreId,
    ordersFoodId: ctx.ordersFoodId,
  });
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
    compensationMeta,
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

async function hasCompensationCreditEntry(
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
          idempotency_key = ${`merchant_cancel_comp_credit:${orderCoreId}`}
          OR (
            COALESCE(metadata->>'entry_type', '') = 'order_cancellation'
            AND COALESCE(metadata->>'balance_impact', '') = 'credit'
          )
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

async function applyAdminOverrideCancellationLedger(
  sql: Sql,
  input: ApplyMerchantOrderCancellationLedgerInput,
  mode: MerchantDebitMode
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
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
    return { applied: true, recorded: true, skipped: "already_recorded", entryType: "info", mode };
  }

  const hasPayout = await orderHasPayoutCredited(sql, walletId, ctx.ordersFoodId, input.orderCoreId);
  const scenario = resolveCancellationPayoutScenario(hasPayout);
  const action = resolveAdminCancellationWalletAction(mode, scenario, ctmTotal);
  const compensationMeta = adminCancellationLedgerMetadata({
    action,
    mode,
    scenario,
    orderCoreId: input.orderCoreId,
    eligibleAmount: ctmTotal,
    source: input.source,
    actorSystemUserId: input.actorSystemUserId,
  });

  if (action.kind === "credit") {
    const creditResult = await applyCompensationCredit(sql, {
      walletId,
      amount: action.amount,
      ordersFoodId: ctx.ordersFoodId,
      orderCoreId: input.orderCoreId,
      source: input.source,
      actorSystemUserId: input.actorSystemUserId,
      compensationMeta,
    });
    if (creditResult.applied) {
      await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
      return {
        applied: true,
        recorded: true,
        amount: action.amount,
        ledgerId: creditResult.ledgerId,
        entryType: "credit",
        mode,
      };
    }
    return { applied: false, skipped: "credit_failed", mode };
  }

  if (action.kind === "debit") {
    const debitResult = await applyWalletDebit(sql, {
      walletId,
      amount: action.amount,
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
        amount: action.amount,
        ledgerId: debitResult.ledgerId,
        entryType: "debit",
        mode,
      };
    }
    if (debitResult.skipped === "not_yet_credited") {
      const ledgerId = await recordCancellationInfoLedger(sql, {
        walletId,
        ordersFoodId: ctx.ordersFoodId,
        orderCoreId: input.orderCoreId,
        amount: ctmTotal,
        balanceImpact: "none",
        source: input.source,
        actorSystemUserId: input.actorSystemUserId,
        cancelledByType: input.cancelledByType,
        cancelledByLabel: input.cancelledByLabel,
        compensationMeta: {
          ...compensationMeta,
          recovery_skipped: "not_yet_credited",
        },
      });
      if (ledgerId) {
        await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
        return {
          applied: true,
          recorded: true,
          amount: ctmTotal,
          ledgerId,
          entryType: "info",
          skipped: "not_yet_credited",
          mode,
        };
      }
    }
    return { applied: false, skipped: debitResult.skipped ?? "debit_failed", mode };
  }

  const ledgerId = await recordCancellationInfoLedger(sql, {
    walletId,
    ordersFoodId: ctx.ordersFoodId,
    orderCoreId: input.orderCoreId,
    amount: action.amount > 0 ? action.amount : ctmTotal,
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
      amount: action.amount > 0 ? action.amount : ctmTotal,
      ledgerId,
      entryType: "info",
      mode,
    };
  }

  return { applied: false, skipped: "info_ledger_failed", mode };
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
      return await applyAdminOverrideCancellationLedger(sql, input, explicitMode);
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

    const compensationMeta = compensationMetadataForLedger(plan.resolved, plan.display);
    const engineAuto = !input.merchantDebit?.trim();
    const merchantKeepsAmount = round2(plan.resolved?.merchantKeepsAmount ?? 0);

    const debitResult = await applyMerchantCancellationDebit(sql, effectiveInput, compensationMeta);
    if (debitResult.applied) {
      await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
      return { ...debitResult, recorded: true };
    }

    const ctx = await resolveOrderWalletContext(sql, input.orderCoreId);
    if (!ctx) return { ...debitResult, skipped: debitResult.skipped ?? "merchant_not_found" };

    const ctmTotal = await resolveMerchantCtmAmount(sql, {
      orderCoreId: input.orderCoreId,
      ordersFoodId: ctx.ordersFoodId,
    });
    if (!(ctmTotal > 0)) return { ...debitResult, skipped: debitResult.skipped ?? "zero_ctm" };

    const walletRows = await sql<{ wallet_id: number | string }[]>`
      SELECT get_or_create_merchant_wallet(${ctx.merchantStoreId}::bigint) AS wallet_id
    `;
    const walletId = Number(walletRows[0]?.wallet_id);
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { ...debitResult, skipped: debitResult.skipped ?? "wallet_not_found" };
    }

    const shouldCreditCompensation =
      engineAuto &&
      plan.engineUsed &&
      merchantKeepsAmount > 0 &&
      (debitResult.skipped === "not_yet_credited" || debitResult.skipped === "no_debit");

    const hasCancellation = await hasCancellationLedgerEntry(
      sql,
      walletId,
      ctx.ordersFoodId,
      input.orderCoreId
    );
    if (hasCancellation) {
      const hasCompCredit = await hasCompensationCreditEntry(
        sql,
        walletId,
        ctx.ordersFoodId,
        input.orderCoreId
      );
      if (shouldCreditCompensation && !hasCompCredit) {
        const creditResult = await applyCompensationCredit(sql, {
          walletId,
          amount: merchantKeepsAmount,
          ordersFoodId: ctx.ordersFoodId,
          orderCoreId: input.orderCoreId,
          source: input.source,
          actorSystemUserId: input.actorSystemUserId,
          compensationMeta,
        });
        if (creditResult.applied) {
          await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
          return {
            applied: true,
            recorded: true,
            amount: merchantKeepsAmount,
            ledgerId: creditResult.ledgerId,
            entryType: "credit",
            skipped: "credit_repair",
          };
        }
      }
      return { applied: true, recorded: true, skipped: "already_recorded", entryType: "info" };
    }

    if (shouldCreditCompensation) {
      const creditResult = await applyCompensationCredit(sql, {
        walletId,
        amount: merchantKeepsAmount,
        ordersFoodId: ctx.ordersFoodId,
        orderCoreId: input.orderCoreId,
        source: input.source,
        actorSystemUserId: input.actorSystemUserId,
        compensationMeta,
      });
      if (creditResult.applied) {
        await syncCancellationSettlementBreakdown(sql, input.orderCoreId);
        return {
          applied: true,
          recorded: true,
          amount: merchantKeepsAmount,
          ledgerId: creditResult.ledgerId,
          entryType: "credit",
          skipped: debitResult.skipped,
        };
      }
    }

    const balanceImpact =
      debitResult.skipped === "not_yet_credited" || debitResult.skipped === "no_debit"
        ? "none"
        : "debit";

    const infoAmount =
      engineAuto && plan.engineUsed && plan.resolved
        ? merchantKeepsAmount
        : ctmTotal;

    const ledgerId = await recordCancellationInfoLedger(sql, {
      walletId,
      ordersFoodId: ctx.ordersFoodId,
      orderCoreId: input.orderCoreId,
      amount: infoAmount > 0 ? infoAmount : ctmTotal,
      balanceImpact,
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
