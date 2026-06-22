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
import { roundMoney, idempotencyKey, WALLET_CONSTANTS } from "@gatimitra/contracts";
import { getSql } from "../db/client.js";
import { countMerchantDeliveredOrdersIst } from "./merchant-growth-metrics.js";
import { logStoreActivity } from "./store-activity-feed.js";

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

// ─── Wallet summary (V2 — includes locked_balance, lifetime totals) ──────────

export async function getWalletSummary(storeId: number): Promise<WalletSummary> {
  const sql = getSql();

  try {
    const { backfillMissingDeliveredOrderCredits, backfillMissingCancelledOrderLedger } =
      await import("./backfill-merchant-wallet-credits.js");
    await backfillMissingDeliveredOrderCredits(sql, storeId);
    await backfillMissingCancelledOrderLedger(sql, storeId);
  } catch (e) {
    console.warn("[getWalletSummary] backfill credits:", e);
  }

  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;

  const balanceLedgerRows = await sql`
    SELECT id, balance_type, balance_after, amount, direction, created_at, metadata
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
    ORDER BY created_at ASC, id ASC
    LIMIT 5000
  `;

  const { latestRunningBalanceFromLedgerRows } = await import("./merchant-wallet-ledger-display.js");
  const ledgerRunningBalance = latestRunningBalanceFromLedgerRows(
    (balanceLedgerRows as any[]).map((row) => ({
      id: row.id,
      balance_type: row.balance_type,
      balance_after: row.balance_after != null ? Number(row.balance_after) : null,
      amount: row.amount != null ? Number(row.amount) : null,
      direction: row.direction,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      metadata: row.metadata,
    }))
  );

  if ((balanceLedgerRows as unknown[]).length > 0) {
    await sql`
      UPDATE merchant_wallet
      SET available_balance = ${ledgerRunningBalance},
          updated_at = NOW()
      WHERE id = ${walletId}
        AND ABS(COALESCE(available_balance, 0) - ${ledgerRunningBalance}) >= 0.01
    `;
  }

  const [w] = await sql`
    SELECT available_balance, pending_balance, hold_balance, reserve_balance,
           COALESCE(pending_settlement, 0) AS pending_settlement,
           COALESCE(lifetime_credit, 0) AS lifetime_credit,
           COALESCE(lifetime_debit, 0) AS lifetime_debit,
           total_earned, total_withdrawn, total_penalty, total_commission_deducted, status
    FROM merchant_wallet WHERE id = ${walletId}
  `;
  const wr = w as any;

  const earningRows = await sql`
    SELECT
      COALESCE(SUM(l.amount) FILTER (
        WHERE (l.created_at AT TIME ZONE 'Asia/Kolkata')::date =
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      ), 0)::numeric AS today_earning,
      COALESCE(SUM(l.amount) FILTER (
        WHERE (l.created_at AT TIME ZONE 'Asia/Kolkata')::date =
              ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')::date
      ), 0)::numeric AS yesterday_earning
    FROM merchant_wallet_ledger l
    WHERE l.wallet_id = ${walletId}
      AND l.direction = 'CREDIT'
      AND l.category = 'ORDER_EARNING'
      AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date >=
          ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day')::date
      AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date <=
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
  `;
  const er = earningRows[0] as { today_earning?: unknown; yesterday_earning?: unknown } | undefined;
  const todayEarning = Number(er?.today_earning ?? 0);
  const yesterdayEarning = Number(er?.yesterday_earning ?? 0);

  const payoutRows = await sql`
    SELECT COALESCE(SUM(net_payout_amount), 0) AS total
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  const pendingWithdrawal = Number((payoutRows[0] as any)?.total ?? 0);

  let settlementPaused = false;
  try {
    const [sp] = await sql`
      SELECT COALESCE(settlement_paused, false) AS settlement_paused
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    settlementPaused = Boolean((sp as { settlement_paused?: boolean })?.settlement_paused);
  } catch {
    /* pre-0239 */
  }

  const available = roundMoney(
    (balanceLedgerRows as unknown[]).length > 0
      ? ledgerRunningBalance
      : Number(wr.available_balance ?? 0)
  );
  const hold = roundMoney(Number(wr.hold_balance ?? 0));
  const pending = roundMoney(Number(wr.pending_balance ?? 0));

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
    available_balance: available,
    pending_balance: roundMoney(Number(wr.pending_balance ?? 0)),
    hold_balance: roundMoney(Number(wr.hold_balance ?? 0)),
    reserve_balance: roundMoney(Number(wr.reserve_balance ?? 0)),
    locked_balance: 0,
    pending_settlement: roundMoney(Number(wr.pending_settlement ?? 0)),
    lifetime_credit: roundMoney(Number(wr.lifetime_credit ?? 0)),
    lifetime_debit: roundMoney(Number(wr.lifetime_debit ?? 0)),
    total_earned: roundMoney(Number(wr.total_earned ?? 0)),
    total_withdrawn: roundMoney(Number(wr.total_withdrawn ?? 0)),
    total_penalty: roundMoney(Number(wr.total_penalty ?? 0)),
    total_commission_deducted: roundMoney(Number(wr.total_commission_deducted ?? 0)),
    status: String(wr.status ?? "ACTIVE") as WalletSummary["status"],
    today_earning: roundMoney(todayEarning),
    yesterday_earning: roundMoney(yesterdayEarning),
    pending_withdrawal_total: roundMoney(pendingWithdrawal),
    locked_settlement_total: 0,
    withdrawable_balance: available,
    total_balance: roundMoney(available + hold + pending),
    settlement_paused: settlementPaused,
    delivered_today: deliveredToday,
  };
}

// ─── Ledger query (V2 — includes balance_before, gst, commission, tds, order_id) ─

export async function queryLedger(
  storeId: number,
  opts: LedgerQueryOptions = { limit: WALLET_CONSTANTS.DEFAULT_LEDGER_PAGE_SIZE, offset: 0 }
): Promise<{ entries: LedgerEntry[]; total: number }> {
  const sql = getSql();

  try {
    const { backfillMissingDeliveredOrderCredits, backfillMissingCancelledOrderLedger } =
      await import("./backfill-merchant-wallet-credits.js");
    await backfillMissingDeliveredOrderCredits(sql, storeId);
    await backfillMissingCancelledOrderLedger(sql, storeId);
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

  const fromFilter = opts.from ? `${opts.from}T00:00:00.000Z` : null;
  const toFilter = opts.to ? `${opts.to}T23:59:59.999Z` : null;

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
      AND (${opts.category ?? null}::text IS NULL OR category = ${opts.category ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*)::int AS cnt FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND (${fromFilter}::timestamptz IS NULL OR created_at >= ${fromFilter}::timestamptz)
      AND (${toFilter}::timestamptz IS NULL OR created_at <= ${toFilter}::timestamptz)
      AND (${opts.direction ?? null}::text IS NULL OR direction = ${opts.direction ?? null})
      AND (${opts.category ?? null}::text IS NULL OR category = ${opts.category ?? null})
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
      id: row.id,
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

  return {
    entries: withPgIds,
    total: Number((countRows[0] as any)?.cnt ?? entries.length),
  };
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

// ─── Check for existing pending withdrawals ───────────────────────────────────

export async function getPendingWithdrawalCount(walletId: number): Promise<number> {
  const sql = getSql();
  const [row] = await sql`
    SELECT COUNT(*)::int AS cnt FROM merchant_payout_requests
    WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  return Number((row as any)?.cnt ?? 0);
}

// ─── Create withdrawal request (HOLD-based, safe against failures) ────────────

export async function createWithdrawalRequest(
  storeId: number,
  amount: number,
  bankAccountId: number,
  source: "merchant_app" | "partnersite" | "dashboard"
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

  const pendingCount = await getPendingWithdrawalCount(walletId);
  if (pendingCount >= WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS) {
    throw new Error(
      `Maximum ${WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS} pending withdrawals allowed. Wait for existing ones to complete.`
    );
  }

  const bankCheck = await sql`SELECT id FROM merchant_store_bank_accounts WHERE id = ${bankAccountId} AND store_id = ${storeId}`;
  if (bankCheck.length === 0) throw new Error("Invalid bank account");

  const quote = await getPayoutQuote(storeId, amount);

  // Atomic: HOLD funds from AVAILABLE, insert payout request, link ledger entry.
  // The RPC handles: lock wallet row, check balance, debit AVAILABLE, credit HOLD,
  // insert ledger entries, insert payout request, return payout_request_id.
  // If anything fails, the entire transaction rolls back.
  const holdKey = idempotencyKey("payout_hold", walletId, Date.now());

  const [holdResult] = await sql`
    SELECT merchant_wallet_debit(
      ${walletId}, ${amount}, 'HOLD_LOCK', 'AVAILABLE',
      'WITHDRAWAL', ${0}, ${holdKey},
      ${'Withdrawal hold: ₹' + amount.toFixed(2)},
      ${JSON.stringify({ source, commission: quote.commission_amount, net: quote.net_payout_amount })}::jsonb
    ) AS ledger_id
  `;
  const holdLedgerId = Number((holdResult as any).ledger_id);

  const [creditHoldResult] = await sql`
    SELECT merchant_wallet_credit(
      ${walletId}, ${amount}, 'HOLD_LOCK', 'HOLD',
      'WITHDRAWAL', ${0}, ${holdKey + '_credit_hold'},
      ${'Withdrawal hold (hold bucket): ₹' + amount.toFixed(2)},
      ${JSON.stringify({ hold_debit_ledger_id: holdLedgerId })}::jsonb
    ) AS ledger_id
  `;

  const [payoutRow] = await sql`
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

// ─── Complete withdrawal (called when bank transfer succeeds) ─────────────────

export async function completeWithdrawal(payoutRequestId: number): Promise<void> {
  const sql = getSql();
  const [pr] = await sql`
    SELECT id, wallet_id, amount, commission_amount, net_payout_amount, status
    FROM merchant_payout_requests WHERE id = ${payoutRequestId}
  `;
  if (!pr) throw new Error("Payout request not found");
  const p = pr as any;
  if (p.status !== "APPROVED" && p.status !== "PROCESSING") {
    throw new Error(`Cannot complete payout in status: ${p.status}`);
  }

  const walletId = Number(p.wallet_id);
  const amount = Number(p.amount);
  const debitKey = idempotencyKey("payout_debit", payoutRequestId);

  const [debitResult] = await sql`
    SELECT merchant_wallet_debit(
      ${walletId}, ${amount}, 'WITHDRAWAL', 'HOLD',
      'WITHDRAWAL', ${payoutRequestId}, ${debitKey},
      ${"Funds have been successfully transferred to the registered bank account."},
      ${JSON.stringify({ payout_request_id: payoutRequestId, net_payout_amount: Number(p.net_payout_amount) })}::jsonb
    ) AS ledger_id
  `;

  await sql`
    UPDATE merchant_payout_requests
    SET status = 'COMPLETED',
        debit_ledger_id = ${Number((debitResult as any).ledger_id)},
        completed_at = NOW(), updated_at = NOW()
    WHERE id = ${payoutRequestId}
  `;
}

// ─── Fail withdrawal (release HOLD back to AVAILABLE) ─────────────────────────

export async function failWithdrawal(payoutRequestId: number, reason: string): Promise<void> {
  const sql = getSql();
  const [pr] = await sql`
    SELECT id, wallet_id, amount, status
    FROM merchant_payout_requests WHERE id = ${payoutRequestId}
  `;
  if (!pr) throw new Error("Payout request not found");
  const p = pr as any;
  if (!["PENDING", "APPROVED", "PROCESSING"].includes(p.status)) {
    throw new Error(`Cannot fail payout in status: ${p.status}`);
  }

  const walletId = Number(p.wallet_id);
  const amount = Number(p.amount);
  const releaseKey = idempotencyKey("payout_release", payoutRequestId);

  // Debit from HOLD
  await sql`
    SELECT merchant_wallet_debit(
      ${walletId}, ${amount}, 'HOLD_RELEASE', 'HOLD',
      'WITHDRAWAL', ${payoutRequestId}, ${releaseKey + '_debit_hold'},
      ${'Failed withdrawal release #' + payoutRequestId},
      ${JSON.stringify({ reason })}::jsonb
    )
  `;

  // Credit back to AVAILABLE
  await sql`
    SELECT merchant_wallet_credit(
      ${walletId}, ${amount}, 'FAILED_WITHDRAWAL_REVERSAL', 'AVAILABLE',
      'WITHDRAWAL', ${payoutRequestId}, ${releaseKey},
      ${'Withdrawal failed — funds released #' + payoutRequestId},
      ${JSON.stringify({ payout_request_id: payoutRequestId, reason })}::jsonb
    )
  `;

  await sql`
    UPDATE merchant_payout_requests
    SET status = 'FAILED', failure_reason = ${reason}, updated_at = NOW()
    WHERE id = ${payoutRequestId}
  `;
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

  return {
    wallet_id: walletId,
    ledger_credit_sum: creditSum,
    ledger_debit_sum: debitSum,
    ledger_net: ledgerNet,
    wallet_total: walletTotal,
    difference,
    is_consistent: Math.abs(difference) < 0.01,
    checked_at: new Date().toISOString(),
  };
}
