/**
 * Merchant Wallet Engine — core service for all wallet operations.
 * Used by backend (Fastify) routes for merchant_app.
 * Single source of truth for balance reads, credits, debits, ledger queries.
 *
 * Tables:
 *   merchant_wallet           – balance summary per store
 *   merchant_wallet_ledger    – append-only double-entry ledger
 *   merchant_wallet_transactions – denormalized transaction log
 *   merchant_payout_requests  – withdrawal requests
 *   order_settlement_breakdown – per-order settlement details
 *
 * Balance types: AVAILABLE, PENDING, HOLD, RESERVE, LOCKED
 * Directions: CREDIT, DEBIT
 *
 * IMPORTANT: All monetary mutations go through DB-level RPC functions
 * (merchant_wallet_credit, merchant_wallet_debit, merchant_wallet_credit_to_locked,
 *  merchant_wallet_release_locked, merchant_wallet_hold_for_withdrawal) which
 * guarantee atomicity via SELECT FOR UPDATE + optimistic version locking.
 */
import type {
  WalletSummary,
  LedgerEntry,
  LedgerQueryOptions,
  PayoutQuote,
  PayoutResult,
  ReconciliationReport,
} from "@gatimitra/contracts";
import { roundMoney, idempotencyKey, WALLET_CONSTANTS, calculateMerchantWithdrawalAccounting } from "@gatimitra/contracts";
import { getSql } from "../db/client.js";
import {
  compensationMetadataForLedger,
  planMerchantCancellationLedger,
} from "./merchant-cancellation-compensation-service.js";
import { buildEligibleCompensationMessage, buildCancellationInfoLedgerDescription } from "./merchant-cancellation-compensation-display.js";
import { countMerchantDeliveredOrdersIst } from "./merchant-growth-metrics.js";
import { logStoreActivity } from "./store-activity-feed.js";
import {
  WalletFrozenError,
  isWalletFrozenError,
  merchantWalletFreezeView,
  throwIfMerchantWalletFrozen,
  walletFrozenFromDebitMessage,
} from "./wallet-freeze.js";

const SETTLEMENT_LEDGER_LIMIT = 5000;

function normalizeLedgerTimeBound(value: string, end: boolean): string {
  if (value.includes("T")) return value;
  return end ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
}

// ─── Get or create wallet ─────────────────────────────────────────────────────

export async function getOrCreateWallet(storeId: number): Promise<{ id: number }> {
  const sql = getSql();
  const existing = await sql`
    SELECT id FROM merchant_wallet WHERE merchant_store_id = ${storeId} LIMIT 1
  `;
  if (existing.length > 0) return { id: Number((existing[0] as any).id) };

  const parentRows = await sql`SELECT parent_id FROM merchant_stores WHERE id = ${storeId} LIMIT 1`;
  const parentId = parentRows.length > 0 ? (parentRows[0] as any).parent_id : null;

  const [row] = await sql`
    INSERT INTO merchant_wallet (merchant_store_id, merchant_parent_id)
    VALUES (${storeId}, ${parentId})
    ON CONFLICT (merchant_store_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

export async function getMerchantWalletFreezeStatus(storeId: number) {
  const sql = getSql();
  const [row] = await sql`
    SELECT status, frozen_reason, frozen_at
    FROM merchant_wallet
    WHERE merchant_store_id = ${storeId}
    LIMIT 1
  `;
  return merchantWalletFreezeView(
    (row as { status?: unknown; frozen_reason?: unknown; frozen_at?: unknown } | undefined) ?? {},
  );
}

// ─── Wallet summary (V2 — Partner Site parity) ───────────────────────────────

export type GetWalletSummaryOptions = {
  /** When true, rebuild available from ledger and sync merchant_wallet (Partner ?reconcile=1). */
  reconcile?: boolean;
  /**
   * When true, skip recomputing total_earned from the full ledger.
   * Payout pending/in-process buckets are always loaded.
   */
  lite?: boolean;
};

/**
 * Wallet summary aligned with Partner Site GET /api/merchant/wallet:
 * - Default: read table available_balance (no always-on ledger reconcile)
 * - Today/yesterday earnings: UTC calendar day windows (same as Partner).
 *   Includes ORDER_EARNING + ORDER_ADJUSTMENT credits (compensation / adjustments).
 * - pending_withdrawal_total = PENDING only; in_process = APPROVED+PROCESSING
 * - withdrawable = available minus active payouts not already in hold_balance
 * - Backfill is best-effort and does not block the read path
 */
export async function getWalletSummary(
  storeId: number,
  opts: GetWalletSummaryOptions = {},
): Promise<WalletSummary> {
  const sql = getSql();
  const reconcile = opts.reconcile === true;
  const lite = opts.lite === true;

  // Partner Site: backfill runs in the background — never block the read path.
  void (async () => {
    try {
      const { backfillMissingDeliveredOrderCredits, backfillMissingCancelledOrderLedger } =
        await import("./backfill-merchant-wallet-credits.js");
      await backfillMissingDeliveredOrderCredits(sql, storeId);
      await backfillMissingCancelledOrderLedger(sql, storeId);
    } catch (e) {
      console.warn("[getWalletSummary] backfill credits:", e);
    }
  })();

  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;

  // Best-effort: return rejected/failed withdrawal funds stuck in HOLD to AVAILABLE,
  // then sync available_balance from AVAILABLE ledger when drifted.
  try {
    await repairOrphanedMerchantPayoutHolds(walletId);
  } catch (e) {
    console.warn("[getWalletSummary] repair orphaned payout holds:", e);
  }

  let w: Record<string, unknown> | undefined;
  try {
    const rows = await sql`
      SELECT available_balance, pending_balance, hold_balance, reserve_balance,
             COALESCE(pending_settlement, 0) AS pending_settlement,
             COALESCE(lifetime_credit, 0) AS lifetime_credit,
             COALESCE(lifetime_debit, 0) AS lifetime_debit,
             total_earned, total_withdrawn, total_penalty, total_commission_deducted, status,
             COALESCE(settlement_paused, false) AS settlement_paused,
             frozen_reason, frozen_at
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    w = rows[0] as Record<string, unknown> | undefined;
  } catch {
    const rows = await sql`
      SELECT available_balance, pending_balance, hold_balance, reserve_balance,
             COALESCE(pending_settlement, 0) AS pending_settlement,
             COALESCE(lifetime_credit, 0) AS lifetime_credit,
             COALESCE(lifetime_debit, 0) AS lifetime_debit,
             total_earned, total_withdrawn, total_penalty, total_commission_deducted, status,
             COALESCE(settlement_paused, false) AS settlement_paused
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    w = rows[0] as Record<string, unknown> | undefined;
  }
  const wr = w as any;

  let available_balance = Number(wr.available_balance ?? 0);
  let total_earned = Number(wr.total_earned ?? 0);
  const settlementPaused = Boolean(wr.settlement_paused);

  // Ledger replay on GET previously persisted ₹0 when LIMIT 5000 missed older credits.
  // Never write aggregates from GET. Overlay last AVAILABLE ledger snapshot for display only.
  if (reconcile) {
    try {
      const ledgerAvailable = await readLastAvailableLedgerBalance(walletId);
      if (ledgerAvailable != null) {
        available_balance = ledgerAvailable;
      }
    } catch (e) {
      console.warn("[getWalletSummary] ledger overlay:", e);
    }
  } else if (available_balance < 0.01) {
    try {
      const restored = await readLastAvailableLedgerBalance(walletId);
      if (restored != null && restored >= 0.01) {
        available_balance = restored;
      }
    } catch (e) {
      console.warn("[getWalletSummary] display overlay from last ledger row:", e);
    }
  }

  // Partner Site: UTC calendar-day windows for today / yesterday earnings.
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

  const earningRows = await sql`
    SELECT amount, created_at
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND direction = 'CREDIT'
      AND category IN ('ORDER_EARNING', 'ORDER_ADJUSTMENT')
      AND created_at >= ${yesterdayStart.toISOString()}::timestamptz
      AND created_at < ${todayEnd.toISOString()}::timestamptz
  `;

  let todayEarning = 0;
  let yesterdayEarning = 0;
  for (const row of earningRows as any[]) {
    const amt = Number(row.amount ?? 0);
    const at = row.created_at ? new Date(row.created_at) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    if (at >= todayStart && at < todayEnd) todayEarning += amt;
    else if (at >= yesterdayStart && at < todayStart) yesterdayEarning += amt;
  }

  let pendingWithdrawal = 0;
  let inProcessWithdrawal = 0;
  let paidAmount = 0;
  let failedAmount = 0;
  const payoutRows = await sql`
    SELECT net_payout_amount, status
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId}
  `;
  for (const row of payoutRows as any[]) {
    const amt = Number(row.net_payout_amount ?? 0);
    const st = String(row.status ?? "").toUpperCase();
    if (st === "PENDING") pendingWithdrawal += amt;
    else if (st === "APPROVED" || st === "PROCESSING") inProcessWithdrawal += amt;
    else if (st === "COMPLETED") paidAmount += amt;
    else if (st === "FAILED" || st === "CANCELLED" || st === "REVERSED") failedAmount += amt;
  }

  if (!lite && total_earned <= 0) {
    const allEarnings = await sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM merchant_wallet_ledger
      WHERE wallet_id = ${walletId}
        AND direction = 'CREDIT'
        AND category IN ('ORDER_EARNING', 'ORDER_ADJUSTMENT')
    `;
    total_earned = Number((allEarnings[0] as any)?.total ?? 0);
  }

  const available = roundMoney(available_balance);
  const hold = roundMoney(Number(wr.hold_balance ?? 0));
  const pending = roundMoney(Number(wr.pending_balance ?? 0));
  const freeze = merchantWalletFreezeView(wr);
  const accounting = calculateMerchantWithdrawalAccounting({
    available_balance: available,
    hold_balance: hold,
    pending_balance: pending,
    pending_withdrawal_total: pendingWithdrawal,
    in_process_withdrawal_total: inProcessWithdrawal,
    paid_amount: paidAmount,
    failed_amount: failedAmount,
    is_frozen: freeze.isFrozen,
    settlement_paused: settlementPaused,
  });

  const istTodayRows = await sql`
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today
  `;
  const todayYmd = String((istTodayRows[0] as { today?: string | Date })?.today ?? "").slice(0, 10);
  const deliveredToday =
    todayYmd.length >= 10
      ? await countMerchantDeliveredOrdersIst(sql, storeId, todayYmd, todayYmd)
      : 0;

  return {
    wallet_id: walletId,
    available_balance: accounting.available_balance,
    pending_balance: accounting.pending_balance,
    hold_balance: accounting.held_balance,
    reserve_balance: roundMoney(Number(wr.reserve_balance ?? 0)),
    locked_balance: 0,
    pending_settlement: roundMoney(Number(wr.pending_settlement ?? 0)),
    lifetime_credit: roundMoney(Number(wr.lifetime_credit ?? 0)),
    lifetime_debit: roundMoney(Number(wr.lifetime_debit ?? 0)),
    total_earned: roundMoney(total_earned),
    total_withdrawn: roundMoney(Number(wr.total_withdrawn ?? 0)),
    total_penalty: roundMoney(Number(wr.total_penalty ?? 0)),
    total_commission_deducted: roundMoney(Number(wr.total_commission_deducted ?? 0)),
    status: freeze.status as WalletSummary["status"],
    today_earning: roundMoney(todayEarning),
    yesterday_earning: roundMoney(yesterdayEarning),
    pending_withdrawal_total: accounting.pending_withdrawal,
    in_process_withdrawal_total: accounting.processing_withdrawal,
    locked_settlement_total: 0,
    withdrawable_balance: accounting.withdrawable_balance,
    total_balance: roundMoney(accounting.available_balance + accounting.held_balance + accounting.pending_balance),
    settlement_paused: settlementPaused,
    delivered_today: deliveredToday,
    isFrozen: freeze.isFrozen,
    freezeReason: freeze.freezeReason,
    frozenAt: freeze.frozenAt,
    held_balance: accounting.held_balance,
    pending_withdrawal: accounting.pending_withdrawal,
    processing_withdrawal: accounting.processing_withdrawal,
    paid_amount: accounting.paid_amount,
    failed_amount: accounting.failed_amount,
    is_frozen: accounting.is_frozen,
    withdrawal_allowed: accounting.withdrawal_allowed,
  };
}

/** Authoritative withdrawable amount — the only figure withdrawal APIs may validate against. */
export async function calculateMerchantWithdrawableBalance(storeId: number): Promise<number> {
  const summary = await getWalletSummary(storeId, { lite: true });
  return roundMoney(Number(summary.withdrawable_balance ?? 0));
}

// ─── Ledger query (V2 — includes balance_before, gst, commission, tds, order_id) ─

export async function queryLedger(
  storeId: number,
  opts: LedgerQueryOptions = { limit: WALLET_CONSTANTS.DEFAULT_LEDGER_PAGE_SIZE, offset: 0 }
): Promise<{ entries: LedgerEntry[]; total: number }> {
  const sql = getSql();

  try {
    const { backfillMissingDeliveredOrderCredits, backfillMissingCancelledOrderLedger, repairErroneousZeroCompensationCancellationDebits } =
      await import("./backfill-merchant-wallet-credits.js");
    await backfillMissingDeliveredOrderCredits(sql, storeId);
    await backfillMissingCancelledOrderLedger(sql, storeId);
    await repairErroneousZeroCompensationCancellationDebits(sql, storeId);
  } catch (e) {
    console.warn("[queryLedger] backfill:", e);
  }

  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;

  try {
    const { repairCancellationLedgerWithdrawableMetadata } = await import(
      "./backfill-merchant-wallet-credits.js"
    );
    await repairCancellationLedgerWithdrawableMetadata(sql, walletId);
  } catch (e) {
    console.warn("[queryLedger] repair withdrawable metadata:", e);
  }
  const limit = Math.min(opts.limit ?? WALLET_CONSTANTS.DEFAULT_LEDGER_PAGE_SIZE, WALLET_CONSTANTS.MAX_LEDGER_PAGE_SIZE);
  const offset = opts.offset ?? 0;

  const fromFilter = opts.from ? normalizeLedgerTimeBound(opts.from, false) : null;
  const toFilter = opts.to ? normalizeLedgerTimeBound(opts.to, true) : null;

  const categoryFilter = opts.category?.trim() || null;
  const withdrawalCategoryFilter = categoryFilter === "WITHDRAWAL";

  const rows = await sql`
    SELECT id, direction, category, balance_type, amount,
           COALESCE(balance_before, 0) AS balance_before,
           balance_after,
           reference_type, reference_id, reference_extra, description, metadata,
           COALESCE(status, 'COMPLETED') AS status,
           order_id,
           COALESCE(gst_amount, 0) AS gst_amount,
           COALESCE(commission_amount, 0) AS commission_amount,
           COALESCE(tds_amount, 0) AS tds_amount,
           created_at
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND (${fromFilter}::timestamptz IS NULL OR created_at >= ${fromFilter}::timestamptz)
      AND (${toFilter}::timestamptz IS NULL OR created_at <= ${toFilter}::timestamptz)
      AND (${opts.direction ?? null}::text IS NULL OR direction = ${opts.direction ?? null})
      AND (
        ${categoryFilter}::text IS NULL
        OR (${withdrawalCategoryFilter} AND category IN ('WITHDRAWAL', 'HOLD_LOCK'))
        OR (NOT ${withdrawalCategoryFilter} AND category = ${categoryFilter})
      )
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*)::int AS cnt FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND (${fromFilter}::timestamptz IS NULL OR created_at >= ${fromFilter}::timestamptz)
      AND (${toFilter}::timestamptz IS NULL OR created_at <= ${toFilter}::timestamptz)
      AND (${opts.direction ?? null}::text IS NULL OR direction = ${opts.direction ?? null})
      AND (
        ${categoryFilter}::text IS NULL
        OR (${withdrawalCategoryFilter} AND category IN ('WITHDRAWAL', 'HOLD_LOCK'))
        OR (NOT ${withdrawalCategoryFilter} AND category = ${categoryFilter})
      )
  `;

  const entries: LedgerEntry[] = (rows as any[]).map((r) => ({
    id: r.id,
    direction: r.direction as LedgerEntry["direction"],
    category: r.category,
    balance_type: r.balance_type,
    amount: Number(r.amount),
    balance_before: r.balance_before != null ? Number(r.balance_before) : null,
    balance_after: Number(r.balance_after),
    reference_type: r.reference_type,
    reference_id: r.reference_id,
    reference_extra: r.reference_extra,
    description: r.description,
    metadata: r.metadata,
    status: r.status,
    order_id: r.order_id ?? null,
    gst_amount: r.gst_amount != null ? Number(r.gst_amount) : null,
    commission_amount: r.commission_amount != null ? Number(r.commission_amount) : null,
    tds_amount: r.tds_amount != null ? Number(r.tds_amount) : null,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    formatted_order_id: null,
  }));

  const bucketRows = await sql`
    SELECT id, balance_type, balance_after, amount, direction, created_at, metadata
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
    ORDER BY created_at ASC, id ASC
    LIMIT 5000
  `;

  const {
    buildWithdrawableBalanceByLedgerId,
    applyWithdrawableBalanceToLedgerEntries,
  } = await import("./merchant-wallet-ledger-display.js");
  const withdrawableById = buildWithdrawableBalanceByLedgerId(
    (bucketRows as any[]).map((row) => ({
      id: Number(row.id),
      balance_type: row.balance_type,
      balance_after: row.balance_after != null ? Number(row.balance_after) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      direction: row.direction,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      metadata: row.metadata,
    }))
  );
  const enrichedEntries = applyWithdrawableBalanceToLedgerEntries(entries, withdrawableById);
  const withPgIds = await enrichLedgerWithPgTransactionIds(sql, enrichedEntries);
  const withPayoutStatus = await enrichLedgerWithPayoutRequestStatus(sql, withPgIds);
  // Main enrichments: payout breakdown, order context, cancellation
  // compensation, cancellation descriptions — added in the compensation
  // series on main.
  const withPayoutBreakdown = await enrichLedgerWithPayoutBreakdown(sql, withPayoutStatus);
  const withMerchantBill = await enrichLedgerWithOrderContext(sql, withPayoutBreakdown);
  const withCompensation = await enrichLedgerWithCancellationCompensation(sql, withMerchantBill);
  const withMainDescriptions = enrichLedgerWithCancellationDescriptions(withCompensation);
  // CRS enrichments (ride-service invoice system): overlay
  // enrichMerchantLedgerDescriptions on top, then merge cancellation
  // entries in one final pass.
  const { enrichMerchantLedgerDescriptions } = await import(
    "./enrich-merchant-ledger-descriptions.js"
  );
  const withCrsDescriptions = await enrichMerchantLedgerDescriptions(sql, withMainDescriptions);
  const { mergeCancellationLedgerEntries } = await import(
    "./merge-cancellation-ledger-entries.js"
  );
  const { entries: mergedEntries } = mergeCancellationLedgerEntries(withCrsDescriptions);

  return {
    entries: mergedEntries,
    total: Number((countRows[0] as any)?.cnt ?? entries.length),
  };
}

/** Ledger rows for payout settlement (higher limit, ISO period bounds). */
export async function queryLedgerForSettlement(
  storeId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ entries: LedgerEntry[]; total: number }> {
  return queryLedger(storeId, {
    limit: SETTLEMENT_LEDGER_LIMIT,
    offset: 0,
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
  });
}

// ─── Payout quote ─────────────────────────────────────────────────────────────

/** Merchant receives the full requested amount — no withdrawal-time commission. */
export async function getPayoutQuote(_storeId: number, amount: number): Promise<PayoutQuote> {
  const net = roundMoney(amount);
  return {
    requested_amount: net,
    commission_percentage: 0,
    commission_amount: 0,
    net_payout_amount: net,
  };
}

async function enrichLedgerWithPayoutRequestStatus(
  sql: ReturnType<typeof getSql>,
  entries: LedgerEntry[]
): Promise<LedgerEntry[]> {
  const holdIds = [
    ...new Set(
      entries
        .filter((e) => String(e.category ?? "").toUpperCase() === "HOLD_LOCK")
        .map((e) => e.id)
    ),
  ];
  if (holdIds.length === 0) return entries;

  try {
    const rows = await sql`
      SELECT id, hold_ledger_id, status
      FROM merchant_payout_requests
      WHERE hold_ledger_id = ANY(${holdIds})
    `;
    const byHoldId = new Map<number, { id: number; status: string }>();
    for (const row of rows as unknown as { id: number; hold_ledger_id: number; status: string }[]) {
      byHoldId.set(Number(row.hold_ledger_id), {
        id: Number(row.id),
        status: String(row.status ?? ""),
      });
    }
    return entries.map((entry) => {
      const linked = byHoldId.get(entry.id);
      if (!linked) return entry;
      return {
        ...entry,
        reference_id:
          entry.reference_id != null && Number(entry.reference_id) > 0
            ? entry.reference_id
            : linked.id,
        metadata: {
          ...(entry.metadata ?? {}),
          payout_request_id: linked.id,
          payout_status: linked.status,
        },
      };
    });
  } catch {
    return entries;
  }
}

async function enrichLedgerWithPgTransactionIds(
  sql: ReturnType<typeof getSql>,
  entries: LedgerEntry[]
): Promise<LedgerEntry[]> {
  const payoutIds = [
    ...new Set(
      entries
        .filter((e) => e.category === "WITHDRAWAL" && e.reference_id != null && e.reference_id > 0)
        .map((e) => e.reference_id as number)
    ),
  ];
  if (payoutIds.length === 0) return entries;

  const pgByPayoutId = new Map<number, string>();
  try {
    const rows = await sql`
      SELECT pr.id,
        COALESCE(pr.pg_transaction_id, ppa.gateway_payout_id, pr.utr_reference, ppa.utr_reference) AS pg_transaction_id
      FROM merchant_payout_requests pr
      LEFT JOIN payment_payout_approvals ppa
        ON ppa.payout_request_id = pr.id AND ppa.payout_type = 'MERCHANT'
      WHERE pr.id = ANY(${payoutIds})
    `;
    for (const row of rows as unknown as { id: number; pg_transaction_id: string | null }[]) {
      if (row.pg_transaction_id?.trim()) {
        pgByPayoutId.set(Number(row.id), row.pg_transaction_id.trim());
      }
    }
  } catch {
    const rows = await sql`
      SELECT id, COALESCE(pg_transaction_id, utr_reference) AS pg_transaction_id
      FROM merchant_payout_requests
      WHERE id = ANY(${payoutIds})
    `;
    for (const row of rows as unknown as { id: number; pg_transaction_id: string | null }[]) {
      if (row.pg_transaction_id?.trim()) {
        pgByPayoutId.set(Number(row.id), row.pg_transaction_id.trim());
      }
    }
  }

  return entries.map((entry) => {
    if (entry.category !== "WITHDRAWAL" || entry.reference_id == null) return entry;
    const pg = pgByPayoutId.get(entry.reference_id);
    return pg ? { ...entry, pg_transaction_id: pg } : entry;
  });
}

type OrderBreakdownRow = {
  orders_food_id: number;
  total_ctm: string | number | null;
  food_items_total_value: string | number | null;
  item_total: string | number | null;
  packaging_charge: string | number | null;
  merchant_gross: string | number | null;
  coupon_discount: string | number | null;
  merchant_funded_discount: string | number | null;
  delivery_fee: string | number | null;
  promo_discount: string | number | null;
  other_restaurant_discount: string | number | null;
  delivery_charge_discount: string | number | null;
  coupon_offer_discount: string | number | null;
  percentage_flat_offer_discount: string | number | null;
  combo_offer_discount: string | number | null;
  free_delivery_offer_discount: string | number | null;
  payment_mechanism_fee: string | number | null;
  customer_compensation: string | number | null;
  cancellation_refund: string | number | null;
  cancellation_compensation: string | number | null;
  compensation_scenario: string | null;
  compensation_pct: string | number | null;
  merchant_net: string | number | null;
  commission_amount: string | number | null;
  fulfillment_status: string | null;
};

function n(v: string | number | null | undefined): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function mergePayoutMeta(
  existing: Record<string, unknown> | null | undefined,
  row: OrderBreakdownRow
): Record<string, unknown> {
  const itemTotal = n(row.item_total);
  const packaging = n(row.packaging_charge);
  const frozenCtm =
    n(row.total_ctm) || n(row.food_items_total_value) || n(row.merchant_gross);
  const merchantCtm = frozenCtm > 0 ? frozenCtm : itemTotal + packaging;
  const coupon =
    n(row.coupon_offer_discount) || n(row.promo_discount) || n(row.coupon_discount);
  const percentageFlat =
    n(row.percentage_flat_offer_discount) ||
    n(row.other_restaurant_discount) ||
    n(row.merchant_funded_discount);
  const combo = n(row.combo_offer_discount);
  const freeDelivery =
    n(row.free_delivery_offer_discount) ||
    n(row.delivery_charge_discount) ||
    n(row.delivery_fee);
  const mechanism = n(row.payment_mechanism_fee) || n(row.commission_amount);
  const compensation = Math.max(
    n(row.customer_compensation),
    n(row.cancellation_refund),
  );
  const status = row.fulfillment_status?.trim() || "DELIVERED";
  const isRejected = ["REJECTED", "CANCELLED", "RTO"].includes(status.toUpperCase());
  const cancellationComp = n(row.cancellation_compensation);
  const merchantKeeps =
    cancellationComp > 0
      ? cancellationComp
      : isRejected && n(row.merchant_net) > 0
        ? n(row.merchant_net)
        : 0;

  return {
    ...(existing ?? {}),
    item_subtotal: itemTotal,
    item_total: itemTotal,
    packaging_charge: packaging,
    packaging_charges: packaging,
    merchant_gross: merchantCtm > 0 ? merchantCtm : 0,
    ...(merchantCtm > 0 ? { total_ctm: merchantCtm, merchant_ctm: merchantCtm, merchant_gross_revenue: merchantCtm } : {}),
    coupon_offer_discount: coupon,
    coupon_discount: coupon,
    percentage_flat_offer_discount: percentageFlat,
    combo_offer_discount: combo,
    free_delivery_offer_discount: freeDelivery,
    promo_discount: coupon,
    restaurant_discount_promo: coupon,
    other_restaurant_discount: percentageFlat,
    merchant_funded_discount: percentageFlat,
    delivery_charge_discount: freeDelivery,
    payment_mechanism_fee: mechanism,
    mechanism_fee: mechanism,
    customer_compensation: compensation,
    cancellation_refund: compensation,
    order_status: status,
    fulfillment_status: status,
    ...(merchantKeeps > 0
      ? {
          merchant_keeps_amount: merchantKeeps,
          cancellation_compensation: merchantKeeps,
          compensation_engine: true,
        }
      : {}),
    ...(row.compensation_scenario?.trim()
      ? { compensation_scenario: row.compensation_scenario.trim() }
      : {}),
    ...(n(row.compensation_pct) > 0 ? { compensation_pct: n(row.compensation_pct) } : {}),
    ...(isRejected && merchantKeeps > 0 ? { merchant_net: merchantKeeps } : {}),
  };
}

async function enrichLedgerWithOrderContext(
  sql: ReturnType<typeof getSql>,
  entries: LedgerEntry[]
): Promise<LedgerEntry[]> {
  const foodIds = new Set<number>();
  const coreIds = new Set<number>();

  for (const entry of entries) {
    if (String(entry.reference_type ?? "").toUpperCase() !== "ORDER") continue;
    if (entry.reference_id != null && entry.reference_id > 0) {
      foodIds.add(entry.reference_id);
    }
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const coreFromMeta = Number(meta?.orders_core_id);
    if (Number.isFinite(coreFromMeta) && coreFromMeta > 0) coreIds.add(coreFromMeta);
    if (entry.order_id != null && entry.order_id > 0) coreIds.add(entry.order_id);
  }

  if (foodIds.size === 0 && coreIds.size === 0) return entries;

  type OrderContextRow = {
    orders_food_id: number;
    orders_core_id: number;
    formatted_order_id: string | null;
    rejected_reason: string | null;
    cancelled_by_label: string | null;
    cancelled_by_type: string | null;
    total_ctm: string | number | null;
    food_items_total_value: string | number | null;
    item_total: string | number | null;
    packaging_charge: string | number | null;
    billing_item_total: string | number | null;
    billing_addon_total: string | number | null;
    billing_packaging_fee: string | number | null;
  };

  let rows: OrderContextRow[] = [];
  try {
    rows = (await sql`
      SELECT
        f.id AS orders_food_id,
        c.id AS orders_core_id,
        COALESCE(
          NULLIF(TRIM(c.formatted_order_id), ''),
          NULLIF(TRIM(f.formatted_order_id), '')
        ) AS formatted_order_id,
        NULLIF(TRIM(f.rejected_reason), '') AS rejected_reason,
        NULLIF(TRIM(f.cancelled_by_label), '') AS cancelled_by_label,
        NULLIF(TRIM(COALESCE(f.cancelled_by_type, c.cancelled_by_type)), '') AS cancelled_by_type,
        c.total_ctm,
        f.food_items_total_value,
        osb.item_total,
        osb.packaging_charge,
        (c.billing_snapshot->>'item_total')::numeric AS billing_item_total,
        (c.billing_snapshot->>'addon_total')::numeric AS billing_addon_total,
        (c.billing_snapshot->>'packaging_fee')::numeric AS billing_packaging_fee
      FROM public.orders_food f
      INNER JOIN public.orders_core c ON c.id = f.order_id
      LEFT JOIN public.order_settlement_breakdown osb ON osb.order_id = c.id
      WHERE f.id = ANY(${[...foodIds]})
         OR c.id = ANY(${[...coreIds]})
    `) as OrderContextRow[];
  } catch {
    return entries;
  }

  const byFoodId = new Map(rows.map((r) => [Number(r.orders_food_id), r]));
  const byCoreId = new Map(rows.map((r) => [Number(r.orders_core_id), r]));

  const resolveRow = (entry: LedgerEntry): OrderContextRow | undefined => {
    if (String(entry.reference_type ?? "").toUpperCase() !== "ORDER") return undefined;
    if (entry.reference_id != null && entry.reference_id > 0) {
      const byFood = byFoodId.get(entry.reference_id);
      if (byFood) return byFood;
    }
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const coreFromMeta = Number(meta?.orders_core_id);
    if (Number.isFinite(coreFromMeta) && coreFromMeta > 0) {
      const byCore = byCoreId.get(coreFromMeta);
      if (byCore) return byCore;
    }
    if (entry.order_id != null && entry.order_id > 0) {
      return byCoreId.get(entry.order_id);
    }
    return undefined;
  };

  const resolveBillParts = (row: OrderContextRow): { itemSubtotal: number; packaging: number } => {
    const billingItems = n(row.billing_item_total) + n(row.billing_addon_total);
    const billingPackaging = n(row.billing_packaging_fee);
    if (billingItems > 0 || billingPackaging > 0) {
      return {
        itemSubtotal: billingItems > 0 ? billingItems : n(row.item_total),
        packaging: billingPackaging > 0 ? billingPackaging : n(row.packaging_charge),
      };
    }

    const itemSubtotal = n(row.item_total);
    const packaging = n(row.packaging_charge);
    if (itemSubtotal > 0 || packaging > 0) {
      return { itemSubtotal, packaging };
    }

    const frozen = n(row.total_ctm);
    if (frozen > 0) {
      return { itemSubtotal: Math.max(0, frozen - packaging), packaging };
    }
    return { itemSubtotal: 0, packaging: 0 };
  };

  const resolveCtm = (row: OrderContextRow): number => {
    const frozen = n(row.total_ctm);
    if (frozen > 0) return frozen;
    const fromFood = n(row.food_items_total_value);
    if (fromFood > 0) return fromFood;
    const { itemSubtotal, packaging } = resolveBillParts(row);
    const fromBill = itemSubtotal + packaging;
    if (fromBill > 0) return fromBill;
    return 0;
  };

  return entries.map((entry) => {
    const row = resolveRow(entry);
    if (!row) return entry;
    const formatted = row.formatted_order_id?.trim() || null;
    const { itemSubtotal, packaging } = resolveBillParts(row);
    const merchantCtm = resolveCtm(row);
    const existingMeta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const metadata: Record<string, unknown> = {
      ...(existingMeta ?? {}),
      ...(formatted ? { formatted_order_id: formatted } : {}),
      orders_core_id: Number(row.orders_core_id),
    };
    if (row.rejected_reason) {
      metadata.food_rejected_reason = row.rejected_reason;
      metadata.rejected_reason = row.rejected_reason;
      metadata.reason_detail = row.rejected_reason;
    }
    if (row.cancelled_by_label) {
      metadata.cancelled_by_label = row.cancelled_by_label;
    }
    if (row.cancelled_by_type) {
      metadata.cancelled_by_type = row.cancelled_by_type;
    }
    if (itemSubtotal > 0) {
      metadata.item_subtotal = itemSubtotal;
      metadata.item_total = itemSubtotal;
    }
    if (packaging > 0) {
      metadata.packaging_charge = packaging;
      metadata.packaging_charges = packaging;
    }
    if (merchantCtm > 0) {
      metadata.merchant_gross_revenue = merchantCtm;
      metadata.total_ctm = merchantCtm;
      metadata.merchant_ctm = merchantCtm;
      metadata.food_items_total_value = merchantCtm;
    }
    return {
      ...entry,
      formatted_order_id: formatted,
      order_id: entry.order_id ?? (Number(row.orders_core_id) || null),
      metadata,
    };
  });
}

async function enrichLedgerWithPayoutBreakdown(
  sql: ReturnType<typeof getSql>,
  entries: LedgerEntry[]
): Promise<LedgerEntry[]> {
  const foodIds = [
    ...new Set(
      entries
        .filter((e) => {
          if (e.reference_id == null || e.reference_id <= 0) return false;
          if (e.category === "ORDER_EARNING") return true;
          const meta = (e.metadata ?? null) as Record<string, unknown> | null;
          return meta?.entry_type === "order_cancellation";
        })
        .map((e) => e.reference_id as number)
    ),
  ];
  if (foodIds.length === 0) return entries;

  let rows: OrderBreakdownRow[] = [];
  try {
    rows = (await sql`
      SELECT
        f.id AS orders_food_id,
        c.total_ctm,
        f.food_items_total_value,
        osb.item_total,
        osb.packaging_charge,
        osb.merchant_gross,
        osb.coupon_discount,
        osb.merchant_funded_discount,
        osb.delivery_fee,
        osb.promo_discount,
        osb.other_restaurant_discount,
        osb.delivery_charge_discount,
        osb.coupon_offer_discount,
        osb.percentage_flat_offer_discount,
        osb.combo_offer_discount,
        osb.free_delivery_offer_discount,
        osb.payment_mechanism_fee,
        osb.customer_compensation,
        osb.cancellation_refund,
        osb.cancellation_compensation,
        osb.compensation_scenario,
        osb.compensation_pct,
        osb.merchant_net,
        osb.commission_amount,
        osb.fulfillment_status
      FROM public.orders_food f
      INNER JOIN public.orders_core c ON c.id = f.order_id
      INNER JOIN public.order_settlement_breakdown osb ON osb.order_id = f.order_id
      WHERE f.id = ANY(${foodIds})
    `) as OrderBreakdownRow[];
  } catch {
    return entries;
  }

  const byFoodId = new Map(rows.map((r) => [Number(r.orders_food_id), r]));
  return entries.map((entry) => {
    if (entry.reference_id == null) return entry;
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const isEarning = entry.category === "ORDER_EARNING";
    const isCancellation = meta?.entry_type === "order_cancellation";
    if (!isEarning && !isCancellation) return entry;
    const row = byFoodId.get(entry.reference_id);
    if (!row) return entry;
    const mergedMeta = mergePayoutMeta(
      (entry.metadata ?? null) as Record<string, unknown> | null,
      row
    );
    return {
      ...entry,
      metadata: mergedMeta,
      commission_amount: entry.commission_amount ?? n(row.commission_amount),
    };
  });
}

function ledgerEntryOrderCoreId(entry: LedgerEntry): number | null {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  if (entry.order_id != null && entry.order_id > 0) return entry.order_id;
  const fromMeta = Number(meta?.orders_core_id);
  return Number.isFinite(fromMeta) && fromMeta > 0 ? fromMeta : null;
}

function ledgerEntryNeedsCompensationEnrichment(entry: LedgerEntry): boolean {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  if (!meta) return false;
  if (meta.admin_override === true) return false;
  const status = String(meta.order_status ?? meta.fulfillment_status ?? "").toUpperCase();
  const isCancelled =
    meta.entry_type === "order_cancellation" ||
    status === "REJECTED" ||
    status === "CANCELLED" ||
    status === "RTO";
  if (!isCancelled) return false;
  if (meta.compensation_engine && meta.eligible_message) {
    return meta.merchant_keeps_amount == null;
  }
  return !meta.compensation_engine || !meta.eligible_message;
}

function enrichLedgerWithCancellationDescriptions(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.map((entry) => {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    if (!meta || meta.entry_type !== "order_cancellation") return entry;

    const desc = String(entry.description ?? "").trim();
    const needsRewrite =
      !desc ||
      /no merchant credit/i.test(desc) ||
      /^Order\s+\S+\s+cancelled\s*$/i.test(desc);
    if (!needsRewrite) return entry;

    const fromDesc = desc.match(/^Order\s+(\S+)/i)?.[1]?.replace(/^#/, "");
    const formattedOrderId =
      String(entry.formatted_order_id ?? "").trim().replace(/^#/, "") ||
      fromDesc ||
      (entry.order_id != null ? String(entry.order_id) : String(entry.reference_id ?? entry.id));

    const balanceImpact =
      String(meta.balance_impact ?? "").toLowerCase() === "debit" ? "debit" : "none";

    return {
      ...entry,
      description: buildCancellationInfoLedgerDescription({
        formattedOrderId,
        balanceImpact,
        compensationMeta: meta,
      }),
    };
  });
}

async function enrichLedgerWithCancellationCompensation(
  sql: ReturnType<typeof getSql>,
  entries: LedgerEntry[]
): Promise<LedgerEntry[]> {
  const cancelledEntries = entries.filter((e) => {
    const meta = (e.metadata ?? null) as Record<string, unknown> | null;
    const status = String(meta?.order_status ?? meta?.fulfillment_status ?? "").toUpperCase();
    return (
      meta?.entry_type === "order_cancellation" ||
      status === "REJECTED" ||
      status === "CANCELLED" ||
      status === "RTO"
    );
  });

  const coreIds = [
    ...new Set(
      cancelledEntries
        .map((e) => ledgerEntryOrderCoreId(e))
        .filter((id): id is number => id != null)
    ),
  ];
  if (coreIds.length === 0) return entries;

  type OrderCancelRow = {
    orders_core_id: number;
    rejected_reason: string | null;
    cancelled_by_label: string | null;
    cancelled_by_type: string | null;
  };

  let cancelRows: OrderCancelRow[] = [];
  try {
    cancelRows = (await sql`
      SELECT
        c.id AS orders_core_id,
        NULLIF(TRIM(f.rejected_reason), '') AS rejected_reason,
        NULLIF(TRIM(f.cancelled_by_label), '') AS cancelled_by_label,
        NULLIF(TRIM(COALESCE(f.cancelled_by_type, c.cancelled_by_type)), '') AS cancelled_by_type
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      WHERE c.id = ANY(${coreIds})
    `) as OrderCancelRow[];
  } catch {
    return entries;
  }

  const cancelByCore = new Map(
    cancelRows.map((r) => [Number(r.orders_core_id), r]),
  );

  const needsPlanIds = coreIds.filter((coreId) =>
    entries.some((e) => {
      if (ledgerEntryOrderCoreId(e) !== coreId) return false;
      return ledgerEntryNeedsCompensationEnrichment(e);
    }),
  );

  const compensationByCore = new Map<number, Record<string, unknown>>();
  await Promise.all(
    needsPlanIds.map(async (coreId) => {
      try {
        const ctx = cancelByCore.get(coreId);
        const plan = await planMerchantCancellationLedger(sql, coreId, null, {
          cancelledByType: ctx?.cancelled_by_type ?? null,
          cancelledByLabel: ctx?.cancelled_by_label ?? null,
          rejectedReason: ctx?.rejected_reason ?? null,
        });
        if (!plan.resolved?.engineEnabled) return;
        const meta = compensationMetadataForLedger(plan.resolved, plan.display);
        if (Object.keys(meta).length > 0) compensationByCore.set(coreId, meta);
      } catch {
        /* optional enrichment */
      }
    }),
  );

  return entries.map((entry) => {
    const coreId = ledgerEntryOrderCoreId(entry);
    if (coreId == null) return entry;
    const ctx = cancelByCore.get(coreId);
    const existing = (entry.metadata ?? null) as Record<string, unknown> | null;
    const status = String(existing?.order_status ?? existing?.fulfillment_status ?? "").toUpperCase();
    const isCancelled =
      existing?.entry_type === "order_cancellation" ||
      status === "REJECTED" ||
      status === "CANCELLED" ||
      status === "RTO";
    if (!isCancelled) return entry;

    const rejectedReason =
      ctx?.rejected_reason?.trim() ||
      (typeof existing?.food_rejected_reason === "string"
        ? existing.food_rejected_reason.trim()
        : "") ||
      null;
    const reasonPatch: Record<string, unknown> = {};
    if (rejectedReason) {
      reasonPatch.food_rejected_reason = rejectedReason;
      reasonPatch.rejected_reason = rejectedReason;
      reasonPatch.reason_detail = rejectedReason;
      if (existing?.compensation_engine) {
        const pct = Number(existing.compensation_pct);
        if (Number.isFinite(pct)) {
          reasonPatch.eligible_message = buildEligibleCompensationMessage({
            cancelledByBrand: String(existing.cancelled_by_brand ?? "GatiMitra"),
            reasonDetail: rejectedReason,
            compensationPct: pct,
          });
        }
      }
    }
    if (ctx?.cancelled_by_label) {
      reasonPatch.cancelled_by_label = ctx.cancelled_by_label;
    }
    if (ctx?.cancelled_by_type) {
      reasonPatch.cancelled_by_type = ctx.cancelled_by_type;
    }

    const extra = compensationByCore.get(coreId);
    const needsPlan = ledgerEntryNeedsCompensationEnrichment(entry);
    if (!needsPlan && !rejectedReason && !extra) return entry;

    const compensationPatch =
      needsPlan && extra
        ? (() => {
            const next = { ...extra };
            if (rejectedReason) {
              next.reason_detail = rejectedReason;
              delete next.rejected_reason;
            }
            return next;
          })()
        : {};

    return {
      ...entry,
      metadata: {
        ...(existing ?? {}),
        ...compensationPatch,
        ...reasonPatch,
      },
    };
  });
}

// ─── Check for existing pending withdrawals ───────────────────────────────────

export async function getPendingWithdrawalCount(walletId: number): Promise<number> {
  const sql = getSql();
  const [row] = await sql`
    SELECT COUNT(*)::int AS cnt FROM merchant_payout_requests
    WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  return Number((row as any)?.cnt ?? 0);
}

async function assertPayoutBankEligible(storeId: number, bankAccountId: number): Promise<void> {
  const sql = getSql();
  let row: Record<string, unknown> | undefined;
  try {
    const rows = await sql`
      SELECT id, is_active, is_disabled, is_verified, verification_status, upi_verified
      FROM merchant_store_bank_accounts
      WHERE id = ${bankAccountId} AND store_id = ${storeId}
      LIMIT 1
    `;
    row = rows[0] as Record<string, unknown> | undefined;
  } catch {
    const rows = await sql`
      SELECT id FROM merchant_store_bank_accounts
      WHERE id = ${bankAccountId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (rows.length === 0) throw new Error("Invalid bank account");
    return;
  }
  if (!row) throw new Error("Invalid bank account");
  if (row.is_disabled === true) throw new Error("Bank account is disabled");
  if (row.is_active === false) throw new Error("Bank account is not active");
  const vs = String(row.verification_status ?? "").trim().toLowerCase();
  const verified = row.is_verified === true || vs === "verified" || row.upi_verified === true;
  if (!verified) {
    throw new Error("Bank account is not verified. Verify the account before withdrawing.");
  }
}

// ─── Create withdrawal request (HOLD-based, safe against failures) ────────────

export async function createWithdrawalRequest(
  storeId: number,
  amount: number,
  bankAccountId: number,
  source: "merchant_app" | "partnersite" | "dashboard",
  clientIdempotencyKey?: string,
): Promise<PayoutResult> {
  const sql = getSql();

  // Explicit `number` widening — the constant is `100 as const` so without
  // this `let` would infer the literal type 100 and the reassignment below
  // would fail with TS2322.
  let minAmount: number = WALLET_CONSTANTS.MIN_WITHDRAWAL_AMOUNT;
  try {
    const payoutRule = await sql`
      SELECT min_payout_amount FROM payment_payout_rules
      WHERE is_active AND party_type = 'MERCHANT' ORDER BY id DESC LIMIT 1
    `;
    if (payoutRule.length > 0) {
      minAmount = Number((payoutRule[0] as { min_payout_amount?: number }).min_payout_amount ?? minAmount);
    }
  } catch {
    /* pre-0239 */
  }
  if (amount < minAmount) {
    throw new Error(`Amount must be at least ₹${minAmount}`);
  }

  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;

  const recentDuplicate = await sql`
    SELECT id, amount, commission_percentage, commission_amount, net_payout_amount, status, hold_ledger_id
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId}
      AND bank_account_id = ${bankAccountId}
      AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      AND ABS(amount - ${amount}) < 0.009
      AND requested_at > NOW() - INTERVAL '5 minutes'
    ORDER BY id DESC
    LIMIT 1
  `;
  if (recentDuplicate.length > 0) {
    const pr = recentDuplicate[0] as any;
    return {
      payout_request_id: Number(pr.id),
      amount: Number(pr.amount),
      commission_percentage: Number(pr.commission_percentage ?? 0),
      commission_amount: Number(pr.commission_amount ?? 0),
      net_payout_amount: Number(pr.net_payout_amount ?? pr.amount),
      status: String(pr.status) as PayoutResult["status"],
      hold_ledger_id: pr.hold_ledger_id != null ? Number(pr.hold_ledger_id) : null,
    };
  }

  const pendingCount = await getPendingWithdrawalCount(walletId);
  if (pendingCount >= WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS) {
    throw new Error(
      `Maximum ${WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS} pending withdrawals allowed. Wait for existing ones to complete.`
    );
  }

  await assertPayoutBankEligible(storeId, bankAccountId);

  const quote = await getPayoutQuote(storeId, amount);

  // Partner Site parity: HOLD AVAILABLE → HOLD bucket, then insert payout request.
  // Freeze check shares the same row lock as debit so a concurrent admin freeze cannot slip through.
  const holdKey = clientIdempotencyKey?.trim()
    ? idempotencyKey("payout_hold", clientIdempotencyKey.trim())
    : idempotencyKey(
        "payout_hold",
        walletId,
        bankAccountId,
        Math.round(amount * 100),
        Math.floor(Date.now() / 120_000),
      );
  let holdLedgerId = 0;
  let payoutRow: any;

  try {
    await sql.begin(async (tx) => {
      const [locked] = await tx`
        SELECT status, frozen_reason, available_balance, hold_balance
        FROM merchant_wallet
        WHERE id = ${walletId}
        FOR UPDATE
      `;
      throwIfMerchantWalletFrozen(locked as { status?: unknown; frozen_reason?: unknown });

      const [activePayouts] = await tx`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'PENDING' THEN net_payout_amount ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'PROCESSING') THEN net_payout_amount ELSE 0 END), 0) AS in_process
        FROM merchant_payout_requests
        WHERE wallet_id = ${walletId}
          AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      `;
      const accounting = calculateMerchantWithdrawalAccounting({
        available_balance: Number((locked as { available_balance?: unknown }).available_balance ?? 0),
        hold_balance: Number((locked as { hold_balance?: unknown }).hold_balance ?? 0),
        pending_withdrawal_total: Number((activePayouts as { pending?: unknown })?.pending ?? 0),
        in_process_withdrawal_total: Number((activePayouts as { in_process?: unknown })?.in_process ?? 0),
        is_frozen: false,
      });
      if (amount > accounting.withdrawable_balance + 0.009) {
        throw new Error(
          `Insufficient withdrawable balance. Available to withdraw: ₹${accounting.withdrawable_balance.toFixed(2)}`,
        );
      }

      const [holdResult] = await tx`
        SELECT merchant_wallet_debit(
          ${walletId}, ${amount}, 'HOLD_LOCK', 'AVAILABLE',
          'WITHDRAWAL', ${0}, ${holdKey},
          ${'Withdrawal requested: ₹' + amount.toFixed(2)},
          ${JSON.stringify({ source, commission: quote.commission_amount, net: quote.net_payout_amount })}::text::jsonb
        ) AS ledger_id
      `;
      holdLedgerId = Number((holdResult as any).ledger_id);

      await tx`
        SELECT merchant_wallet_credit(
          ${walletId}, ${amount}, 'HOLD_LOCK', 'HOLD',
          'WITHDRAWAL', ${0}, ${holdKey + '_credit_hold'},
          ${'Withdrawal requested (processing): ₹' + amount.toFixed(2)},
          ${JSON.stringify({ hold_debit_ledger_id: holdLedgerId })}::text::jsonb
        ) AS ledger_id
      `;

      const [row] = await tx`
        INSERT INTO merchant_payout_requests (
          wallet_id, amount, status,
          commission_percentage, commission_amount, net_payout_amount,
          bank_account_id, hold_ledger_id
        ) VALUES (
          ${walletId}, ${amount}, 'PENDING',
          ${quote.commission_percentage}, ${quote.commission_amount}, ${quote.net_payout_amount},
          ${bankAccountId}, ${holdLedgerId}
        ) RETURNING id, amount, commission_percentage, commission_amount, net_payout_amount, status, requested_at
      `;
      payoutRow = row;
    });
  } catch (holdErr) {
    if (isWalletFrozenError(holdErr)) throw holdErr;
    const msg = holdErr instanceof Error ? holdErr.message : "";
    const frozenErr = walletFrozenFromDebitMessage(msg, null);
    if (frozenErr) {
      try {
        const [again] = await sql`
          SELECT frozen_reason FROM merchant_wallet WHERE id = ${walletId} LIMIT 1
        `;
        throw new WalletFrozenError(
          typeof (again as { frozen_reason?: unknown } | undefined)?.frozen_reason === "string"
            ? String((again as { frozen_reason?: unknown }).frozen_reason)
            : frozenErr.freezeReason,
        );
      } catch (inner) {
        if (isWalletFrozenError(inner)) throw inner;
        throw frozenErr;
      }
    }
    throw holdErr instanceof Error ? holdErr : new Error("Wallet hold failed. Please try again.");
  }

  if (!payoutRow) {
    throw new Error("Failed to create payout request");
  }

  const pr = payoutRow as any;
  const payoutRequestId = Number(pr.id);

  await logStoreActivity({
    storeId, section: "bank_account", action: "create",
    entityId: payoutRequestId,
    entityName: `Withdrawal ₹${amount.toFixed(2)}`,
    summary: `Withdrawal requested: ₹${amount.toFixed(2)} (net ₹${quote.net_payout_amount.toFixed(2)}) — funds held`,
    diff: { amount, commission: quote.commission_amount, net: quote.net_payout_amount, bank_account_id: bankAccountId },
    actorType: source === "dashboard" ? "agent" : "merchant",
    source,
  });

  return {
    payout_request_id: payoutRequestId,
    amount: Number(pr.amount),
    commission_percentage: Number(pr.commission_percentage),
    commission_amount: Number(pr.commission_amount),
    net_payout_amount: Number(pr.net_payout_amount),
    status: String(pr.status) as PayoutResult["status"],
    hold_ledger_id: holdLedgerId,
  };
}

export type PayoutRequestsSummary = {
  paid: number;
  in_process: number;
  pending: number;
  failed: number;
  total: number;
};

export type PayoutRequestListItem = {
  id: number;
  amount: number;
  net_payout_amount: number;
  status: string;
  requested_at: string;
  completed_at: string | null;
  utr_reference: string | null;
  failure_reason: string | null;
};

/** Partner Site GET /api/merchant/payout-requests parity. */
export async function listPayoutRequests(
  storeId: number,
  limit = 5,
): Promise<{ summary: PayoutRequestsSummary; recent: PayoutRequestListItem[] }> {
  const sql = getSql();
  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;
  const lim = Math.min(20, Math.max(1, limit));

  const rows = await sql`
    SELECT id, amount, net_payout_amount, status, requested_at, completed_at,
           utr_reference, failure_reason
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId}
    ORDER BY requested_at DESC
    LIMIT 500
  `;

  const list = rows as any[];
  const sumNet = (subset: any[]) =>
    roundMoney(subset.reduce((s, r) => s + Number(r.net_payout_amount ?? r.amount ?? 0), 0));

  const paidRows = list.filter((r) => String(r.status) === "COMPLETED");
  const inProcessRows = list.filter((r) => {
    const st = String(r.status);
    return st === "APPROVED" || st === "PROCESSING";
  });
  const pendingRows = list.filter((r) => String(r.status) === "PENDING");
  const failedRows = list.filter((r) => {
    const st = String(r.status);
    return st === "FAILED" || st === "CANCELLED" || st === "REVERSED";
  });

  const paid = sumNet(paidRows);
  const in_process = sumNet(inProcessRows);
  const pending = sumNet(pendingRows);
  const failed = sumNet(failedRows);

  const recent: PayoutRequestListItem[] = list.slice(0, lim).map((r) => ({
    id: Number(r.id),
    amount: roundMoney(Number(r.amount ?? 0)),
    net_payout_amount: roundMoney(Number(r.net_payout_amount ?? r.amount ?? 0)),
    status: String(r.status ?? "PENDING"),
    requested_at:
      r.requested_at instanceof Date
        ? r.requested_at.toISOString()
        : String(r.requested_at ?? ""),
    completed_at: r.completed_at
      ? r.completed_at instanceof Date
        ? r.completed_at.toISOString()
        : String(r.completed_at)
      : null,
    utr_reference: r.utr_reference != null ? String(r.utr_reference) : null,
    failure_reason: r.failure_reason != null ? String(r.failure_reason) : null,
  }));

  return {
    summary: {
      paid,
      in_process,
      pending,
      failed,
      total: roundMoney(paid + in_process + pending + failed),
    },
    recent,
  };
}

// ─── Complete withdrawal (called when bank transfer succeeds) ─────────────────

export async function completeWithdrawal(payoutRequestId: number): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const [pr] = await tx`
      SELECT id, wallet_id, amount, commission_amount, net_payout_amount, status
      FROM merchant_payout_requests WHERE id = ${payoutRequestId} FOR UPDATE
    `;
    if (!pr) throw new Error("Payout request not found");
    const p = pr as any;
    if (p.status !== "APPROVED" && p.status !== "PROCESSING") {
      throw new Error(`Cannot complete payout in status: ${p.status}`);
    }

    const walletId = Number(p.wallet_id);
    const amount = Number(p.amount);
    await tx`SELECT id FROM merchant_wallet WHERE id = ${walletId} FOR UPDATE`;

    const debitKey = idempotencyKey("payout_debit", payoutRequestId);
    const [debitResult] = await tx`
      SELECT merchant_wallet_debit(
        ${walletId}, ${amount}, 'WITHDRAWAL', 'HOLD',
        'WITHDRAWAL', ${payoutRequestId}, ${debitKey},
        ${"Funds have been successfully transferred to the registered bank account."},
        ${JSON.stringify({ payout_request_id: payoutRequestId, net_payout_amount: Number(p.net_payout_amount) })}::text::jsonb
      ) AS ledger_id
    `;

    await tx`
      UPDATE merchant_payout_requests
      SET status = 'COMPLETED',
          debit_ledger_id = ${Number((debitResult as any).ledger_id)},
          completed_at = NOW(), updated_at = NOW()
      WHERE id = ${payoutRequestId}
    `;
  });
}

// ─── Fail withdrawal (release HOLD back to AVAILABLE) ─────────────────────────

export async function failWithdrawal(payoutRequestId: number, reason: string): Promise<void> {
  await releaseWithdrawalHold(payoutRequestId, "FAILED", reason || "Bank transfer failed");
}

export async function rejectWithdrawal(payoutRequestId: number, reason: string): Promise<void> {
  await releaseWithdrawalHold(payoutRequestId, "FAILED", reason || "Withdrawal rejected");
}

export async function cancelWithdrawal(payoutRequestId: number, reason: string): Promise<void> {
  await releaseWithdrawalHold(payoutRequestId, "CANCELLED", reason || "Withdrawal cancelled");
}

export async function reverseWithdrawal(payoutRequestId: number, reason: string): Promise<void> {
  await releaseWithdrawalHold(payoutRequestId, "REVERSED", reason || "Payout reversed");
}

async function releaseWithdrawalHold(
  payoutRequestId: number,
  terminalStatus: "FAILED" | "CANCELLED" | "REVERSED",
  reason: string,
): Promise<void> {
  const sql = getSql();

  if (terminalStatus === "FAILED") {
    try {
      await sql.begin(async (tx) => {
        const [pr] = await tx`
          SELECT id, wallet_id, status
          FROM merchant_payout_requests WHERE id = ${payoutRequestId} FOR UPDATE
        `;
        if (!pr) throw new Error("Payout request not found");
        const p = pr as any;
        if (!["PENDING", "APPROVED", "PROCESSING"].includes(String(p.status))) {
          throw new Error(`Cannot fail payout in status: ${p.status}`);
        }
        await tx`SELECT id FROM merchant_wallet WHERE id = ${Number(p.wallet_id)} FOR UPDATE`;
        await tx`
          SELECT public.merchant_wallet_fail_withdrawal(
            ${payoutRequestId}::bigint,
            ${reason}::text
          )
        `;
      });
      return;
    } catch (rpcErr) {
      if (rpcErr instanceof Error && /cannot fail payout in status/i.test(rpcErr.message)) {
        throw rpcErr;
      }
      console.warn("[releaseWithdrawalHold] merchant_wallet_fail_withdrawal RPC failed, using inline release:", rpcErr);
    }
  }

  await sql.begin(async (tx) => {
    const [pr] = await tx`
      SELECT id, wallet_id, amount, status
      FROM merchant_payout_requests WHERE id = ${payoutRequestId} FOR UPDATE
    `;
    if (!pr) throw new Error("Payout request not found");
    const p = pr as any;
    if (!["PENDING", "APPROVED", "PROCESSING"].includes(String(p.status))) {
      throw new Error(`Cannot release payout in status: ${p.status}`);
    }

    const walletId = Number(p.wallet_id);
    const amount = Number(p.amount);
    await tx`SELECT id FROM merchant_wallet WHERE id = ${walletId} FOR UPDATE`;
    const releaseKey = idempotencyKey("payout_release", payoutRequestId, terminalStatus);

    await tx`
      SELECT merchant_wallet_debit(
        ${walletId}, ${amount}, 'HOLD_RELEASE', 'HOLD',
        'WITHDRAWAL', ${payoutRequestId}, ${releaseKey + '_debit_hold'},
        ${'Withdrawal released — hold cleared'},
        ${JSON.stringify({ reason, payout_request_id: payoutRequestId, terminal_status: terminalStatus })}::text::jsonb
      )
    `;

    await tx`
      SELECT merchant_wallet_credit(
        ${walletId}, ${amount}, 'FAILED_WITHDRAWAL_REVERSAL', 'AVAILABLE',
        'WITHDRAWAL', ${payoutRequestId}, ${releaseKey},
        ${'Withdrawal returned — funds restored to your wallet'},
        ${JSON.stringify({ payout_request_id: payoutRequestId, reason, terminal_status: terminalStatus })}::text::jsonb
      )
    `;

    await tx`
      UPDATE merchant_payout_requests
      SET status = ${terminalStatus}, failure_reason = ${reason}, updated_at = NOW()
      WHERE id = ${payoutRequestId}
    `;
  });
}

/**
 * Release HOLD that no longer belongs to an active payout so merchants can re-withdraw
 * after reject/fail. Also covers FAILED/CANCELLED rows that never got a reversal credit.
 */
export async function repairOrphanedMerchantPayoutHolds(walletId: number): Promise<number> {
  const sql = getSql();
  let released = 0;

  const missingReversal = await sql`
    SELECT pr.id, pr.amount
    FROM merchant_payout_requests pr
    WHERE pr.wallet_id = ${walletId}
      AND pr.status IN ('FAILED', 'CANCELLED', 'REVERSED')
      AND COALESCE(pr.amount, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM merchant_wallet_ledger l
        WHERE l.wallet_id = pr.wallet_id
          AND l.reference_id = pr.id
          AND l.direction = 'CREDIT'
          AND l.category::text IN ('FAILED_WITHDRAWAL_REVERSAL', 'WITHDRAWAL_REVERSAL')
      )
    ORDER BY pr.id ASC
  `;

  for (const row of missingReversal as unknown as { id: number; amount: string | number }[]) {
    const payoutRequestId = Number(row.id);
    const amount = roundMoney(Number(row.amount ?? 0));
    if (!(amount > 0)) continue;

    const [w] = await sql`
      SELECT hold_balance FROM merchant_wallet WHERE id = ${walletId} FOR UPDATE
    `;
    const hold = roundMoney(Number((w as { hold_balance?: number })?.hold_balance ?? 0));
    if (hold + 1e-9 < amount) continue;

    const debitKey = `payout_repair_hold_debit_${payoutRequestId}`;
    const creditKey = `payout_repair_release_${payoutRequestId}`;
    try {
      await sql`
        SELECT merchant_wallet_debit(
          ${walletId}, ${amount}, 'HOLD_RELEASE', 'HOLD',
          'WITHDRAWAL', ${payoutRequestId}, ${debitKey},
          ${'Repair: release hold for terminal payout'},
          ${JSON.stringify({ payout_request_id: payoutRequestId, repair: true })}::text::jsonb
        )
      `;
      await sql`
        SELECT merchant_wallet_credit(
          ${walletId}, ${amount}, 'FAILED_WITHDRAWAL_REVERSAL', 'AVAILABLE',
          'WITHDRAWAL', ${payoutRequestId}, ${creditKey},
          ${'Withdrawal returned — funds restored to your wallet'},
          ${JSON.stringify({ payout_request_id: payoutRequestId, repair: true })}::text::jsonb
        )
      `;
      released = roundMoney(released + amount);
    } catch (e) {
      console.warn(`[repairOrphanedMerchantPayoutHolds] payout ${payoutRequestId}:`, e);
    }
  }

  const [bal] = await sql`
    SELECT COALESCE(hold_balance, 0) AS hold_balance,
           COALESCE(available_balance, 0) AS available_balance
    FROM merchant_wallet WHERE id = ${walletId}
  `;
  const [active] = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId}
      AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  const holdNow = roundMoney(Number((bal as { hold_balance?: number })?.hold_balance ?? 0));
  const activeHold = roundMoney(Number((active as { total?: number })?.total ?? 0));
  const excess = roundMoney(holdNow - activeHold);
  if (excess >= 0.01) {
    const ledgerAvailable = await readLastAvailableLedgerBalance(walletId) ?? 0;
    const debitKey = `payout_repair_excess_hold_debit_${walletId}_${Math.round(excess * 100)}`;
    const creditKey = `payout_repair_excess_hold_credit_${walletId}_${Math.round(excess * 100)}`;
    try {
      await sql`
        SELECT merchant_wallet_debit(
          ${walletId}, ${excess}, 'HOLD_RELEASE', 'HOLD',
          'WITHDRAWAL', ${0}, ${debitKey},
          ${'Repair: release orphaned hold balance'},
          ${JSON.stringify({ repair: true, excess: true })}::text::jsonb
        )
      `;
      // Only credit AVAILABLE when ledger withdrawable is ~0 (funds never returned).
      // If AVAILABLE ledger already has the money, clearing HOLD alone avoids double-credit.
      if (ledgerAvailable < 0.01) {
        await sql`
          SELECT merchant_wallet_credit(
            ${walletId}, ${excess}, 'FAILED_WITHDRAWAL_REVERSAL', 'AVAILABLE',
            'WITHDRAWAL', ${0}, ${creditKey},
            ${'Orphaned hold released — funds restored to your wallet'},
            ${JSON.stringify({ repair: true, excess: true })}::text::jsonb
          )
        `;
        released = roundMoney(released + excess);
      }
    } catch (e) {
      console.warn(`[repairOrphanedMerchantPayoutHolds] excess hold wallet ${walletId}:`, e);
    }
  }

  return released;
}

/** Last AVAILABLE-bucket ledger snapshot — used to restore a zeroed wallet row without replaying history. */
async function readLastAvailableLedgerBalance(walletId: number): Promise<number | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT balance_after
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND (balance_type IS NULL OR UPPER(TRIM(balance_type::text)) IN ('AVAILABLE', 'LOCKED'))
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  const raw = (rows[0] as { balance_after?: unknown } | undefined)?.balance_after;
  const n = Number(raw);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/** Sync merchant_wallet.available_balance from AVAILABLE ledger running balance when drifted. */
async function syncAvailableBalanceFromLedger(
  walletId: number,
  currentAvailable: number,
): Promise<number> {
  const sql = getSql();
  const balanceLedgerRows = await sql`
    SELECT id, balance_type, balance_after, amount, direction, created_at, metadata
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
    ORDER BY created_at ASC, id ASC
    LIMIT 5000
  `;
  if ((balanceLedgerRows as unknown[]).length === 0) return currentAvailable;

  const { latestRunningBalanceFromLedgerRows } = await import("./merchant-wallet-ledger-display.js");
  const ledgerRunningBalance = latestRunningBalanceFromLedgerRows(
    (balanceLedgerRows as any[]).map((row) => ({
      id: Number(row.id),
      balance_type: row.balance_type,
      balance_after: row.balance_after != null ? Number(row.balance_after) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      direction: row.direction,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      metadata: row.metadata,
    })),
  );

  if (Math.abs(currentAvailable - ledgerRunningBalance) >= 0.01) {
    await sql`
      UPDATE merchant_wallet
      SET available_balance = ${ledgerRunningBalance},
          updated_at = NOW()
      WHERE id = ${walletId}
    `;
  }
  return ledgerRunningBalance;
}

// ─── Reconciliation check ─────────────────────────────────────────────────────

export async function reconcileWallet(storeId: number): Promise<ReconciliationReport> {
  const sql = getSql();
  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;

  const [sums] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) AS credit_sum,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) AS debit_sum
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
  `;
  const s = sums as any;
  const creditSum = roundMoney(Number(s.credit_sum));
  const debitSum = roundMoney(Number(s.debit_sum));
  const ledgerNet = roundMoney(creditSum - debitSum);

  const [w] = await sql`
    SELECT available_balance, pending_balance, hold_balance, reserve_balance
    FROM merchant_wallet WHERE id = ${walletId}
  `;
  const wr = w as any;
  const walletTotal = roundMoney(
    Number(wr.available_balance ?? 0) +
    Number(wr.pending_balance ?? 0) +
    Number(wr.hold_balance ?? 0) +
    Number(wr.reserve_balance ?? 0)
  );
  const difference = roundMoney(ledgerNet - walletTotal);

  const [active] = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId}
      AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  const holdNow = roundMoney(Number((wr.hold_balance ?? 0)));
  const activeHold = roundMoney(Number((active as { total?: number })?.total ?? 0));
  const lastLedger = await readLastAvailableLedgerBalance(walletId);
  const availableNow = roundMoney(Number(wr.available_balance ?? 0));
  const holdGap = roundMoney(holdNow - activeHold);
  const ledgerGap = lastLedger == null ? 0 : roundMoney(availableNow - lastLedger);

  const issues: string[] = [];
  if (Math.abs(difference) >= 0.01) {
    issues.push(`ledger_net vs wallet_total differs by ${difference}`);
  }
  if (Math.abs(holdGap) >= 0.01) {
    issues.push(`hold_balance ${holdNow} vs active payouts ${activeHold}`);
  }
  if (Math.abs(ledgerGap) >= 0.01) {
    issues.push(`available_balance ${availableNow} vs last AVAILABLE ledger ${lastLedger}`);
  }
  if (issues.length > 0) {
    console.error("[reconcileWallet] mismatch", { walletId, storeId, issues, difference, holdGap, ledgerGap });
  }

  return {
    wallet_id: walletId,
    ledger_credit_sum: creditSum,
    ledger_debit_sum: debitSum,
    ledger_net: ledgerNet,
    wallet_total: walletTotal,
    difference,
    is_consistent: issues.length === 0,
    checked_at: new Date().toISOString(),
    hold_vs_active_payouts: holdGap,
    available_vs_last_ledger: ledgerGap,
    issues,
  };
}
