/**
 * Merchant wallet operations for dashboard.
 * Uses shared wallet contracts from @gatimitra/contracts for type consistency
 * across backend, dashboard, partnersite, and merchant_app.
 */
import type {
  WalletSummary,
  LedgerEntry,
  LedgerQueryOptions,
  ReconciliationReport,
  PayoutResult,
} from "@gatimitra/contracts";
import { roundMoney, WALLET_CONSTANTS, idempotencyKey } from "@gatimitra/contracts";
import { enrichWalletSummary } from "@/lib/payment/wallet-summary-enrichment";
import { getPaymentPayoutQuote } from "@/lib/payment/payout-quote";
import { getSql } from "../client";

export { getPaymentPayoutQuote };

// ─── Get or create wallet ─────────────────────────────────────────────────────

async function getOrCreateWalletId(storeId: number): Promise<number> {
  const sql = getSql();
  const existing = await sql`SELECT id FROM merchant_wallet WHERE merchant_store_id = ${storeId} LIMIT 1`;
  if (existing.length > 0) return Number((existing[0] as any).id);
  const parentRows = await sql`SELECT parent_id FROM merchant_stores WHERE id = ${storeId} LIMIT 1`;
  const parentId = parentRows.length > 0 ? (parentRows[0] as any).parent_id : null;
  const [row] = await sql`
    INSERT INTO merchant_wallet (merchant_store_id, merchant_parent_id)
    VALUES (${storeId}, ${parentId})
    ON CONFLICT (merchant_store_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;
  return Number((row as any).id);
}

// ─── Wallet summary (V2 — includes locked_balance, lifetime totals) ──────────

export async function getWalletSummary(storeId: number): Promise<WalletSummary> {
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
  let wr: Record<string, unknown>;
  try {
    const [w] = await sql`
      SELECT available_balance, pending_balance, hold_balance, reserve_balance,
             COALESCE(locked_balance, 0) AS locked_balance,
             COALESCE(pending_settlement, 0) AS pending_settlement,
             COALESCE(lifetime_credit, 0) AS lifetime_credit,
             COALESCE(lifetime_debit, 0) AS lifetime_debit,
             total_earned, total_withdrawn, total_penalty, total_commission_deducted, status
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    wr = (w ?? {}) as Record<string, unknown>;
  } catch {
    const [w] = await sql`
      SELECT available_balance, pending_balance, hold_balance, reserve_balance,
             total_earned, total_withdrawn, total_penalty, total_commission_deducted, status
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    wr = (w ?? {}) as Record<string, unknown>;
    wr.locked_balance = 0;
    wr.pending_settlement = 0;
    wr.lifetime_credit = 0;
    wr.lifetime_debit = 0;
  }
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart); todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

  const earningRows = await sql`
    SELECT amount, created_at FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId} AND direction = 'CREDIT' AND category = 'ORDER_EARNING'
      AND created_at >= ${yesterdayStart.toISOString()} AND created_at < ${todayEnd.toISOString()}
  `;
  let todayEarning = 0, yesterdayEarning = 0;
  for (const r of earningRows as any[]) {
    const amt = Number(r.amount ?? 0);
    const at = new Date(r.created_at);
    if (at >= todayStart && at < todayEnd) todayEarning += amt;
    else if (at >= yesterdayStart && at < todayStart) yesterdayEarning += amt;
  }
  let pendingWithdrawalTotal = 0;
  try {
    const payoutRows = await sql`
      SELECT COALESCE(SUM(net_payout_amount), 0) AS total
      FROM merchant_payout_requests WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
    `;
    pendingWithdrawalTotal = Number((payoutRows[0] as any)?.total ?? 0);
  } catch {
    try {
      const payoutRows = await sql`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM merchant_payout_requests WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      `;
      pendingWithdrawalTotal = Number((payoutRows[0] as any)?.total ?? 0);
    } catch {
      pendingWithdrawalTotal = 0;
    }
  }
  const base: WalletSummary = {
    wallet_id: walletId,
    available_balance: roundMoney(Number(wr.available_balance ?? 0)),
    pending_balance: roundMoney(Number(wr.pending_balance ?? 0)),
    hold_balance: roundMoney(Number(wr.hold_balance ?? 0)),
    reserve_balance: roundMoney(Number(wr.reserve_balance ?? 0)),
    locked_balance: roundMoney(Number(wr.locked_balance ?? 0)),
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
    pending_withdrawal_total: roundMoney(pendingWithdrawalTotal),
  };
  return enrichWalletSummary(sql, walletId, base);
}

// ─── Ledger query (V2) ───────────────────────────────────────────────────────

export async function queryLedger(
  storeId: number,
  opts: Partial<LedgerQueryOptions> = {}
): Promise<{ entries: LedgerEntry[]; total: number }> {
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
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
  return {
    entries: (rows as any[]).map((r) => ({
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
    })),
    total: Number((countRows[0] as any)?.cnt ?? 0),
  };
}

// ─── Reconciliation check ─────────────────────────────────────────────────────

export async function reconcileWallet(storeId: number): Promise<ReconciliationReport> {
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);

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
    SELECT available_balance, pending_balance, hold_balance, reserve_balance,
           COALESCE(locked_balance, 0) AS locked_balance
    FROM merchant_wallet WHERE id = ${walletId}
  `;
  const wr = w as any;
  const walletTotal = roundMoney(
    Number(wr.available_balance ?? 0) +
    Number(wr.pending_balance ?? 0) +
    Number(wr.hold_balance ?? 0) +
    Number(wr.reserve_balance ?? 0) +
    Number(wr.locked_balance ?? 0)
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

export async function createWithdrawalRequest(
  storeId: number,
  amount: number,
  bankAccountId: number
): Promise<PayoutResult> {
  const sql = getSql();
  const quote = await getPaymentPayoutQuote(sql, storeId, amount);
  if (amount < quote.min_payout_amount) {
    throw new Error(`Amount must be at least ₹${quote.min_payout_amount}`);
  }

  const walletId = await getOrCreateWalletId(storeId);
  const pendingRows = await sql`
    SELECT COUNT(*)::int AS cnt FROM merchant_payout_requests
    WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  const pendingCount = Number((pendingRows[0] as { cnt?: number })?.cnt ?? 0);
  if (pendingCount >= WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS) {
    throw new Error(`Maximum ${WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS} pending withdrawals allowed`);
  }

  const bankCheck = await sql`
    SELECT id FROM merchant_store_bank_accounts WHERE id = ${bankAccountId} AND store_id = ${storeId} LIMIT 1
  `;
  if (bankCheck.length === 0) throw new Error("Invalid bank account");

  const holdKey = idempotencyKey("payout_hold", walletId, Date.now());
  const [holdResult] = await sql`
    SELECT merchant_wallet_debit(
      ${walletId}, ${amount}, ${"HOLD_LOCK"}, ${"AVAILABLE"},
      ${"WITHDRAWAL"}, ${0}, ${holdKey},
      ${"Withdrawal hold"}, ${JSON.stringify({ net: quote.net_payout_amount })}::jsonb
    ) AS ledger_id
  `;
  const holdLedgerId = Number((holdResult as { ledger_id?: number })?.ledger_id);

  await sql`
    SELECT merchant_wallet_credit(
      ${walletId}, ${amount}, ${"HOLD_LOCK"}, ${"HOLD"},
      ${"WITHDRAWAL"}, ${0}, ${holdKey + "_credit_hold"},
      ${"Withdrawal hold (hold bucket)"}, ${JSON.stringify({ hold_debit_ledger_id: holdLedgerId })}::jsonb
    )
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
    ) RETURNING id, amount, commission_percentage, commission_amount, net_payout_amount, status
  `;
  const pr = payoutRow as Record<string, unknown>;
  return {
    payout_request_id: Number(pr.id),
    amount: Number(pr.amount),
    commission_percentage: Number(pr.commission_percentage),
    commission_amount: Number(pr.commission_amount),
    net_payout_amount: Number(pr.net_payout_amount),
    status: String(pr.status) as PayoutResult["status"],
    hold_ledger_id: holdLedgerId,
  };
}
