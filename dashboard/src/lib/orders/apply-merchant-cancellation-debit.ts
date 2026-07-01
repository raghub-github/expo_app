import { getSql } from "@/lib/db/client";
import { resolveAutoMerchantCancellationDebit } from "@/lib/orders/resolve-merchant-cancellation-ledger";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveMerchantWalletCreditAmount } from "@/lib/merchant-order-ctm";
import { buildCancellationInfoLedgerDescription } from "@/lib/merchant-cancellation-ledger-description";
import type { ResolvedMerchantCompensation } from "@/lib/merchant-cancellation-compensation-engine.types";

export type MerchantDebitMode = "full_debit" | "partial_debit" | "no_debit";

export type ApplyMerchantCancellationDebitInput = {
  orderCoreId: number;
  merchantDebit?: string | null;
  partialAmount?: number | null;
  actorSystemUserId?: number | null;
  source: string;
};

export type ApplyMerchantCancellationDebitResult = {
  applied: boolean;
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
  if (e && typeof e === "object") {
    const o = e as { code?: string; message?: string };
    if (o.code === "42P01" || o.code === "42703" || o.code === "42883") return true;
    if (typeof o.message === "string" && /does not exist|invalid input value for enum/i.test(o.message)) {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist|invalid input value for enum/i.test(msg);
}

async function syncCancellationSettlementBreakdown(orderCoreId: number): Promise<void> {
  try {
    const sql = getSql();
    await sql.unsafe(
      `SELECT public.sync_order_settlement_cancellation_compensation($1::bigint)`,
      [orderCoreId],
    );
  } catch (e) {
    if (!isRelationMissingError(e)) {
      console.warn("[syncCancellationSettlementBreakdown]", orderCoreId, e);
    }
  }
}

async function resolveOrderWalletContext(orderCoreId: number): Promise<{
  merchantStoreId: number;
  ordersFoodId: number;
  orderStatus: string;
  rejectedReason: string | null;
  cancelledByType: string | null;
  cancelledByLabel: string | null;
} | null> {
  const sql = getSql();
  const rows = await sql.unsafe<
    {
      merchant_store_id: number | null;
      food_store_id: number | null;
      orders_food_id: number | null;
      order_status: string | null;
      rejected_reason: string | null;
      cancelled_by_type: string | null;
      cancelled_by_label: string | null;
    }[]
  >(
    `
      SELECT
        c.merchant_store_id,
        f.merchant_store_id AS food_store_id,
        f.id AS orders_food_id,
        COALESCE(f.order_status::text, c.current_status::text, c.status::text) AS order_status,
        NULLIF(TRIM(f.rejected_reason), '') AS rejected_reason,
        NULLIF(TRIM(COALESCE(f.cancelled_by_type, c.cancelled_by_type)), '') AS cancelled_by_type,
        NULLIF(TRIM(f.cancelled_by_label), '') AS cancelled_by_label
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `,
    [orderCoreId]
  );
  const row = rows[0];
  const merchantStoreId = Number(row?.food_store_id ?? row?.merchant_store_id);
  const ordersFoodId = Number(row?.orders_food_id);
  if (!Number.isFinite(merchantStoreId) || merchantStoreId <= 0) return null;
  if (!Number.isFinite(ordersFoodId) || ordersFoodId <= 0) return null;
  return {
    merchantStoreId,
    ordersFoodId,
    orderStatus: String(row?.order_status ?? ""),
    rejectedReason: row?.rejected_reason ?? null,
    cancelledByType: row?.cancelled_by_type ?? null,
    cancelledByLabel: row?.cancelled_by_label ?? null,
  };
}

async function resolveMerchantCtmAmount(args: {
  orderCoreId: number;
  ordersFoodId: number;
  merchantStoreId: number;
}): Promise<number> {
  if (supabaseAdmin) {
    const amount = await resolveMerchantWalletCreditAmount(supabaseAdmin, {
      ordersCoreId: args.orderCoreId,
      ordersFoodId: args.ordersFoodId,
      storeId: args.merchantStoreId,
    });
    if (amount > 0) return round2(amount);
  }

  const sql = getSql();
  const rows = await sql.unsafe<{ total_ctm: string | null; food_items_total_value: string | null }[]>(
    `
      SELECT c.total_ctm::text, f.food_items_total_value::text
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `,
    [args.orderCoreId]
  );
  const row = rows[0];
  const frozenCtm = Number(row?.total_ctm ?? 0);
  const foodItemsTotal = Number(row?.food_items_total_value ?? 0);
  const frozen =
    Number.isFinite(frozenCtm) && frozenCtm > 0
      ? frozenCtm
      : Number.isFinite(foodItemsTotal) && foodItemsTotal > 0
        ? foodItemsTotal
        : 0;
  return round2(Math.max(0, frozen));
}

type BucketNet = { balanceType: string; net: number };

async function resolveOrderCreditBuckets(
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<BucketNet[]> {
  const sql = getSql();
  const rows = await sql.unsafe<{ balance_type: string; net: string }[]>(
    `
      SELECT
        balance_type::text AS balance_type,
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text AS net
      FROM merchant_wallet_ledger
      WHERE wallet_id = $1
        AND reference_type = 'ORDER'::wallet_reference_type
        AND (
          reference_id = $2
          OR idempotency_key = $3
          OR idempotency_key = $4
          OR (metadata->>'orders_core_id')::bigint = $5
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
    `,
    [
      walletId,
      ordersFoodId,
      `order_earning_${ordersFoodId}`,
      `settle:order:${orderCoreId}`,
      orderCoreId,
    ]
  );
  return rows
    .map((r) => ({
      balanceType: String(r.balance_type),
      net: round2(Number(r.net)),
    }))
    .filter((b) => b.net > 0);
}

async function debitFromBucket(args: {
  walletId: number;
  amount: number;
  balanceType: string;
  ordersFoodId: number;
  orderCoreId: number;
  mode: MerchantDebitMode;
  idempotencySuffix: string;
  actorSystemUserId?: number | null;
}): Promise<number | null> {
  const sql = getSql();
  const amount = round2(args.amount);
  if (!(amount > 0)) return null;

  const idempotencyKey = `merchant_cancel_debit:${args.orderCoreId}:${args.idempotencySuffix}:${args.balanceType}`;
  const description = "Order Cancelled — Cancellation Charges Applied";

  const rows = await sql.unsafe<{ ledger_id: number | null }[]>(
    `
      SELECT merchant_wallet_debit(
        $1::bigint,
        $2::numeric,
        'ORDER_ADJUSTMENT'::wallet_transaction_category,
        $3::wallet_balance_type,
        'ORDER'::wallet_reference_type,
        $4::bigint,
        $5::text,
        $6::text,
        $7::jsonb
      ) AS ledger_id
    `,
    [
      args.walletId,
      amount,
      args.balanceType,
      args.ordersFoodId,
      idempotencyKey,
      description,
      JSON.stringify({
        orders_core_id: args.orderCoreId,
        merchant_debit_mode: args.mode,
        trigger_source: args.idempotencySuffix,
        actor_system_user_id: args.actorSystemUserId ?? null,
      }),
    ]
  );
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0 ? ledgerId : null;
}

async function applyWalletDebit(args: {
  walletId: number;
  amount: number;
  ordersFoodId: number;
  orderCoreId: number;
  mode: MerchantDebitMode;
  actorSystemUserId?: number | null;
}): Promise<{ applied: boolean; ledgerId?: number; skipped?: string }> {
  const target = round2(args.amount);
  if (!(target > 0)) return { applied: false, skipped: "zero_amount" };

  const buckets = await resolveOrderCreditBuckets(args.walletId, args.ordersFoodId, args.orderCoreId);
  let remaining = target;
  let lastLedgerId: number | undefined;

  if (buckets.length > 0) {
    for (const bucket of buckets) {
      if (remaining <= 0) break;
      const slice = round2(Math.min(remaining, bucket.net));
      if (!(slice > 0)) continue;
      try {
        const ledgerId = await debitFromBucket({
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
      : { applied: false, skipped: "insufficient_order_credit" };
  }

  // Order not yet credited — policy compensation credit handled by applyMerchantOrderCancellationLedger.
  return { applied: false, skipped: "not_yet_credited" };
}

async function applyCompensationCredit(args: {
  walletId: number;
  amount: number;
  ordersFoodId: number;
  orderCoreId: number;
  source: string;
  actorSystemUserId?: number | null;
  compensationMeta?: Record<string, unknown>;
}): Promise<{ applied: boolean; ledgerId?: number }> {
  const sql = getSql();
  const amount = round2(args.amount);
  if (!(amount > 0)) return { applied: false };

  const idempotencyKey = `merchant_cancel_comp_credit:${args.orderCoreId}`;
  const description = "Order Cancelled — Compensation Credit";
  const metadata = JSON.stringify({
    orders_core_id: args.orderCoreId,
    entry_type: "order_cancellation",
    balance_impact: "credit",
    merchant_keeps_amount: amount,
    trigger_source: args.source,
    actor_system_user_id: args.actorSystemUserId ?? null,
    fulfillment_status: "REJECTED",
    order_status: "CANCELLED",
    ...(args.compensationMeta ?? {}),
  });

  const rows = await sql.unsafe<{ ledger_id: number | null }[]>(
    `
      SELECT merchant_wallet_credit(
        $1::bigint,
        $2::numeric,
        'ORDER_ADJUSTMENT'::wallet_transaction_category,
        'AVAILABLE'::wallet_balance_type,
        'ORDER'::wallet_reference_type,
        $3::bigint,
        $4::text,
        $5::text,
        $6::jsonb
      ) AS ledger_id
    `,
    [args.walletId, amount, args.ordersFoodId, idempotencyKey, description, metadata]
  );
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0
    ? { applied: true, ledgerId }
    : { applied: false };
}

async function hasCancellationLedgerEntry(
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.unsafe<{ found: boolean }[]>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM merchant_wallet_ledger
        WHERE wallet_id = $1
          AND reference_type = 'ORDER'::wallet_reference_type
          AND reference_id = $2
          AND (
            idempotency_key = $3
            OR idempotency_key = $5
            OR idempotency_key LIKE $4
            OR (metadata->>'entry_type') = 'order_cancellation'
          )
      ) AS found
    `,
    [
      walletId,
      ordersFoodId,
      `merchant_cancel_info:${orderCoreId}`,
      `merchant_cancel_debit:${orderCoreId}:%`,
      `merchant_cancel_comp_credit:${orderCoreId}`,
    ]
  );
  return Boolean(rows[0]?.found);
}

async function resolveFormattedOrderId(orderCoreId: number): Promise<string | null> {
  const sql = getSql();
  const rows = await sql.unsafe<{ formatted_order_id: string | null; order_id: string | null }[]>(
    `
      SELECT formatted_order_id, order_id::text
      FROM orders_core
      WHERE id = $1
      LIMIT 1
    `,
    [orderCoreId]
  );
  const row = rows[0];
  return row?.formatted_order_id?.trim() || row?.order_id?.trim() || null;
}

async function recordCancellationInfoLedger(args: {
  walletId: number;
  ordersFoodId: number;
  orderCoreId: number;
  amount: number;
  balanceImpact: "none" | "debit";
  source: string;
  actorSystemUserId?: number | null;
  compensationMeta?: Record<string, unknown>;
}): Promise<number | null> {
  const sql = getSql();
  const amount = round2(args.amount);
  if (!(amount > 0)) return null;

  const formattedOrderId = (await resolveFormattedOrderId(args.orderCoreId)) ?? `#${args.orderCoreId}`;
  const idempotencyKey = `merchant_cancel_info:${args.orderCoreId}`;
  const description = buildCancellationInfoLedgerDescription({
    formattedOrderId,
    balanceImpact: args.balanceImpact,
    compensationMeta: args.compensationMeta,
  });

  const rows = await sql.unsafe<{ ledger_id: number | null }[]>(
    `
      WITH w AS (
        SELECT
          id,
          available_balance,
          available_balance AS withdrawable_balance
        FROM merchant_wallet
        WHERE id = $1
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
          $2::numeric,
          w.available_balance,
          w.available_balance,
          'ORDER'::wallet_reference_type,
          $3::bigint,
          $4::text,
          $5::text,
          $6::jsonb || jsonb_build_object(
            'withdrawable_after', w.withdrawable_balance,
            'available_snapshot', w.available_balance,
            'locked_snapshot', 0
          ),
          $7::bigint,
          'COMPLETED'
        FROM w
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      )
      SELECT COALESCE(
        (SELECT id FROM ins LIMIT 1),
        (SELECT id FROM merchant_wallet_ledger WHERE idempotency_key = $4 LIMIT 1)
      ) AS ledger_id
    `,
    [
      args.walletId,
      amount,
      args.ordersFoodId,
      idempotencyKey,
      description,
      JSON.stringify({
        entry_type: "order_cancellation",
        balance_impact: args.balanceImpact,
        orders_core_id: args.orderCoreId,
        trigger_source: args.source,
        actor_system_user_id: args.actorSystemUserId ?? null,
        ...(args.compensationMeta ?? {}),
      }),
      args.orderCoreId,
    ]
  );
  const ledgerId = Number(rows[0]?.ledger_id);
  return Number.isFinite(ledgerId) && ledgerId > 0 ? ledgerId : null;
}

function compensationMetaFromResolved(
  resolved: ResolvedMerchantCompensation | null,
  orderContext?: {
    rejectedReason?: string | null;
    cancelledByType?: string | null;
    cancelledByLabel?: string | null;
  }
): Record<string, unknown> | undefined {
  if (!resolved?.engineEnabled) return undefined;
  const brand =
    String(orderContext?.cancelledByType ?? "").trim().toLowerCase() === "customer"
      ? "Customer"
      : "GatiMitra";
  const reason = (orderContext?.rejectedReason ?? "").trim();
  const eligible =
    reason && resolved.compensationPct <= 0.009
      ? `Cancelled by ${brand}: ${reason}. As per policy, you will not receive compensation for this cancellation.`
      : reason && resolved.compensationPct > 0
        ? `Cancelled by ${brand}: ${reason}. As per policy, you will get ${resolved.compensationPct}% of net order value as compensation.`
        : undefined;
  return {
    compensation_engine: "gm_merchant_v1",
    compensation_pct: resolved.compensationPct,
    compensation_scenario: resolved.scenarioCode,
    compensation_exclusion: resolved.exclusionCode,
    merchant_keeps_amount: resolved.merchantKeepsAmount,
    net_order_value: resolved.netOrderValue,
    applied_policy_title: resolved.policyTitle,
    applied_policy_description: resolved.policyDescription,
    cancelled_by_brand: brand,
    reason_detail: reason || null,
    ...(eligible ? { eligible_message: eligible } : {}),
  };
}

export type ApplyMerchantOrderCancellationLedgerInput = ApplyMerchantCancellationDebitInput;

export type ApplyMerchantOrderCancellationLedgerResult = ApplyMerchantCancellationDebitResult & {
  recorded?: boolean;
  entryType?: "debit" | "info" | "credit";
};

/** Always records a merchant ledger row on cancellation (debit when credited, info when not). */
export async function applyMerchantOrderCancellationLedger(
  input: ApplyMerchantOrderCancellationLedgerInput
): Promise<ApplyMerchantOrderCancellationLedgerResult> {
  if (!Number.isFinite(input.orderCoreId) || input.orderCoreId <= 0) {
    return { applied: false, skipped: "invalid_order" };
  }

  try {
    let effectiveInput = input;
    let engineAuto = !input.merchantDebit?.trim();
    let resolved: Awaited<ReturnType<typeof resolveAutoMerchantCancellationDebit>>["resolved"] = null;
    let engineUsed = false;

    if (!input.merchantDebit?.trim()) {
      const auto = await resolveAutoMerchantCancellationDebit(
        input.orderCoreId,
        input.merchantDebit
      );
      resolved = auto.resolved;
      engineUsed = auto.engineUsed;
      if (auto.merchantDebit) {
        effectiveInput = {
          ...input,
          merchantDebit: auto.merchantDebit,
          partialAmount: auto.partialAmount ?? input.partialAmount,
        };
      }
    }

    const debitResult = await applyMerchantCancellationDebit(effectiveInput);
    if (debitResult.applied) {
      await syncCancellationSettlementBreakdown(input.orderCoreId);
      return { ...debitResult, recorded: true, entryType: "debit" };
    }

    const ctx = await resolveOrderWalletContext(input.orderCoreId);
    if (!ctx) return { ...debitResult, skipped: debitResult.skipped ?? "merchant_not_found" };

    const ctmTotal = await resolveMerchantCtmAmount({
      orderCoreId: input.orderCoreId,
      ordersFoodId: ctx.ordersFoodId,
      merchantStoreId: ctx.merchantStoreId,
    });
    if (!(ctmTotal > 0)) return { ...debitResult, skipped: debitResult.skipped ?? "zero_ctm" };

    const sql = getSql();
    const walletRows = await sql.unsafe<{ wallet_id: number | string }[]>(
      `SELECT get_or_create_merchant_wallet($1::bigint) AS wallet_id`,
      [ctx.merchantStoreId]
    );
    const walletId = Number(walletRows[0]?.wallet_id);
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { ...debitResult, skipped: debitResult.skipped ?? "wallet_not_found" };
    }

    if (await hasCancellationLedgerEntry(walletId, ctx.ordersFoodId, input.orderCoreId)) {
      return { applied: true, recorded: true, skipped: "already_recorded", entryType: "info" };
    }

    const merchantKeepsAmount = round2(resolved?.merchantKeepsAmount ?? 0);
    const shouldCreditCompensation =
      engineAuto &&
      engineUsed &&
      merchantKeepsAmount > 0 &&
      (debitResult.skipped === "not_yet_credited" || debitResult.skipped === "no_debit");

    if (shouldCreditCompensation) {
      const creditResult = await applyCompensationCredit({
        walletId,
        amount: merchantKeepsAmount,
        ordersFoodId: ctx.ordersFoodId,
        orderCoreId: input.orderCoreId,
        source: input.source,
        actorSystemUserId: input.actorSystemUserId,
        compensationMeta: resolved
          ? {
              compensation_engine: "gm_merchant_v1",
              compensation_pct: resolved.compensationPct,
              merchant_keeps_amount: resolved.merchantKeepsAmount,
              net_order_value: resolved.netOrderValue,
              compensation_scenario: resolved.scenarioCode,
              compensation_exclusion: resolved.exclusionCode,
            }
          : undefined,
      });
      if (creditResult.applied) {
        await syncCancellationSettlementBreakdown(input.orderCoreId);
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
      engineAuto && engineUsed && resolved ? merchantKeepsAmount : ctmTotal;

    const compensationMeta = compensationMetaFromResolved(resolved, {
      rejectedReason: ctx.rejectedReason,
      cancelledByType: ctx.cancelledByType,
      cancelledByLabel: ctx.cancelledByLabel,
    });

    const ledgerId = await recordCancellationInfoLedger({
      walletId,
      ordersFoodId: ctx.ordersFoodId,
      orderCoreId: input.orderCoreId,
      amount: infoAmount > 0 ? infoAmount : ctmTotal,
      balanceImpact,
      source: input.source,
      actorSystemUserId: input.actorSystemUserId,
      compensationMeta,
    });

    if (ledgerId) {
      await syncCancellationSettlementBreakdown(input.orderCoreId);
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

export async function applyMerchantCancellationDebit(
  input: ApplyMerchantCancellationDebitInput
): Promise<ApplyMerchantCancellationDebitResult> {
  const mode = normalizeMode(input.merchantDebit);
  if (!mode || mode === "no_debit") {
    return { applied: false, skipped: "no_debit" };
  }
  if (!Number.isFinite(input.orderCoreId) || input.orderCoreId <= 0) {
    return { applied: false, skipped: "invalid_order" };
  }

  try {
    const ctx = await resolveOrderWalletContext(input.orderCoreId);
    if (!ctx) return { applied: false, skipped: "merchant_not_found" };

    const ctmTotal = await resolveMerchantCtmAmount({
      orderCoreId: input.orderCoreId,
      ordersFoodId: ctx.ordersFoodId,
      merchantStoreId: ctx.merchantStoreId,
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

    const sql = getSql();
    const walletRows = await sql.unsafe<{ wallet_id: number | string }[]>(
      `SELECT get_or_create_merchant_wallet($1::bigint) AS wallet_id`,
      [ctx.merchantStoreId]
    );
    const walletId = Number(walletRows[0]?.wallet_id);
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { applied: false, skipped: "wallet_not_found" };
    }

    const result = await applyWalletDebit({
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
    };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return { applied: false, skipped: "merchant_wallet_not_migrated" };
    }
    console.error("[applyMerchantCancellationDebit]", e);
    throw e;
  }
}
