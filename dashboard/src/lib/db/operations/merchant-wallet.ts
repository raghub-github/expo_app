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
import { roundMoney, WALLET_CONSTANTS, idempotencyKey, computeMerchantWithdrawalBuckets } from "@gatimitra/contracts";
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
  const [w] = await sql`
    SELECT available_balance, pending_balance, hold_balance, reserve_balance,
           COALESCE(pending_settlement, 0) AS pending_settlement,
           COALESCE(lifetime_credit, 0) AS lifetime_credit,
           COALESCE(lifetime_debit, 0) AS lifetime_debit,
           total_earned, total_withdrawn, total_penalty, total_commission_deducted, status
    FROM merchant_wallet WHERE id = ${walletId}
  `;
  const wr = (w ?? {}) as Record<string, unknown>;
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
  let inProcessWithdrawalTotal = 0;
  try {
    const payoutRows = await sql`
      SELECT net_payout_amount, status
      FROM merchant_payout_requests WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
    `;
    for (const row of payoutRows as any[]) {
      const amt = Number(row.net_payout_amount ?? row.amount ?? 0);
      const st = String(row.status ?? "").toUpperCase();
      if (st === "PENDING") pendingWithdrawalTotal += amt;
      else if (st === "APPROVED" || st === "PROCESSING") inProcessWithdrawalTotal += amt;
    }
  } catch {
    pendingWithdrawalTotal = 0;
    inProcessWithdrawalTotal = 0;
  }
  const buckets = computeMerchantWithdrawalBuckets({
    available_balance: Number(wr.available_balance ?? 0),
    hold_balance: Number(wr.hold_balance ?? 0),
    pending_withdrawal_total: pendingWithdrawalTotal,
    in_process_withdrawal_total: inProcessWithdrawalTotal,
  });
  const base: WalletSummary = {
    wallet_id: walletId,
    available_balance: roundMoney(Number(wr.available_balance ?? 0)),
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
    pending_withdrawal_total: buckets.pending_withdrawal_total,
    in_process_withdrawal_total: buckets.in_process_withdrawal_total,
    withdrawable_balance: buckets.withdrawable_balance,
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

  const categoryFilter = opts.category ?? null;
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
        OR category = ${categoryFilter}
        OR (${withdrawalCategoryFilter} AND category IN ('WITHDRAWAL', 'HOLD_LOCK'))
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
        OR category = ${categoryFilter}
        OR (${withdrawalCategoryFilter} AND category IN ('WITHDRAWAL', 'HOLD_LOCK'))
      )
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

/** Payout request statuses keyed by id — used to hide completed HOLD_LOCK request rows. */
export async function getPayoutStatusesForLedger(
  storeId: number,
  requestIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(requestIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
  const rows = await sql`
    SELECT id, status::text AS status
    FROM merchant_payout_requests
    WHERE wallet_id = ${walletId}
      AND id = ANY(${ids}::bigint[])
  `;
  for (const r of rows as unknown as { id: number; status: string }[]) {
    map.set(Number(r.id), String(r.status ?? "").toUpperCase());
  }
  return map;
}

/** Link HOLD_LOCK ledger ids → payout request (reference_id is often 0 at request time). */
export async function getPayoutLinksByHoldLedgerIds(
  storeId: number,
  holdLedgerIds: number[],
): Promise<Map<number, { id: number; status: string; hold_reason?: string | null }>> {
  const map = new Map<number, { id: number; status: string; hold_reason?: string | null }>();
  const ids = [...new Set(holdLedgerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
  const rows = await sql`
    SELECT
      pr.id,
      pr.hold_ledger_id,
      pr.status::text AS status,
      ppa.approval_notes AS hold_reason
    FROM merchant_payout_requests pr
    LEFT JOIN payment_payout_approvals ppa
      ON ppa.payout_request_id = pr.id AND ppa.payout_type = 'MERCHANT'
    WHERE pr.wallet_id = ${walletId}
      AND pr.hold_ledger_id = ANY(${ids}::bigint[])
  `;
  for (const r of rows as unknown as {
    id: number;
    hold_ledger_id: number;
    status: string;
    hold_reason?: string | null;
  }[]) {
    map.set(Number(r.hold_ledger_id), {
      id: Number(r.id),
      status: String(r.status ?? "").toUpperCase(),
      hold_reason: r.hold_reason != null ? String(r.hold_reason) : null,
    });
  }
  return map;
}

/** Attach PG / UTR ids onto WITHDRAWAL ledger rows (partnersite parity). */
export async function getPgTransactionIdsForPayoutRequests(
  storeId: number,
  payoutRequestIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(payoutRequestIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
  const rows = await sql`
    SELECT
      pr.id,
      COALESCE(pr.pg_transaction_id, ppa.gateway_payout_id, pr.utr_reference, ppa.utr_reference)
        AS pg_transaction_id
    FROM merchant_payout_requests pr
    LEFT JOIN payment_payout_approvals ppa
      ON ppa.payout_request_id = pr.id AND ppa.payout_type = 'MERCHANT'
    WHERE pr.wallet_id = ${walletId}
      AND pr.id = ANY(${ids}::bigint[])
  `;
  for (const r of rows as unknown as { id: number; pg_transaction_id?: string | null }[]) {
    const pg = String(r.pg_transaction_id ?? "").trim();
    if (pg) map.set(Number(r.id), pg);
  }
  return map;
}

/** Resolve public formatted order ids for ORDER-linked ledger rows. */
export async function enrichLedgerFormattedOrderIds<
  T extends {
    reference_type?: string | null;
    reference_id?: number | null;
    order_id?: number | null;
    formatted_order_id?: string | null;
    description?: string | null;
  },
>(entries: T[]): Promise<T[]> {
  const orderRefs = entries.filter(
    (e) => String(e.reference_type ?? "").toUpperCase() === "ORDER" && e.reference_id != null,
  );
  if (orderRefs.length === 0) return entries;
  const foodIds = [
    ...new Set(orderRefs.map((e) => Number(e.reference_id)).filter((id) => Number.isFinite(id) && id > 0)),
  ];
  if (foodIds.length === 0) return entries;
  const sql = getSql();
  const foodRows = await sql`
    SELECT id, order_id FROM orders_food WHERE id = ANY(${foodIds}::bigint[])
  `;
  const foodMap = new Map<number, number>();
  for (const f of foodRows as unknown as { id: number; order_id: number }[]) {
    foodMap.set(Number(f.id), Number(f.order_id));
  }
  const coreIds = [...new Set([...foodMap.values()].filter((id) => Number.isFinite(id) && id > 0))];
  if (coreIds.length === 0) return entries;
  let orderMeta: { id: number; order_id: string | null; formatted_order_id: string | null }[] = [];
  try {
    const coreRows = await sql`
      SELECT id, order_id::text AS order_id, formatted_order_id
      FROM orders_core
      WHERE id = ANY(${coreIds}::bigint[])
    `;
    orderMeta = coreRows as unknown as typeof orderMeta;
  } catch {
    try {
      const ordRows = await sql`
        SELECT id, order_id::text AS order_id, formatted_order_id
        FROM orders
        WHERE id = ANY(${coreIds}::bigint[])
      `;
      orderMeta = ordRows as unknown as typeof orderMeta;
    } catch {
      return entries;
    }
  }
  const orderMetaMap = new Map(
    orderMeta.map((o) => [
      Number(o.id),
      (o.formatted_order_id ?? o.order_id ?? "").trim() || null,
    ]),
  );
  return entries.map((entry) => {
    if (String(entry.reference_type ?? "").toUpperCase() !== "ORDER" || entry.reference_id == null) {
      return entry;
    }
    const oid = foodMap.get(Number(entry.reference_id));
    if (oid == null) return entry;
    const formatted = orderMetaMap.get(oid) ?? null;
    const next = {
      ...entry,
      order_id: oid,
      formatted_order_id: formatted,
    };
    if (formatted && next.description) {
      next.description = String(next.description).replace(/Order #\d+/i, `Order ${formatted}`);
    }
    return next;
  });
}

/** Full ledger snapshots for withdrawable Balance After rewrite (AVAILABLE running balance). */
export async function getLedgerBucketSnapshotsForWallet(
  storeId: number,
): Promise<
  {
    id: number;
    balance_type: string | null;
    balance_after: number | null;
    amount: number | null;
    direction: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }[]
> {
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
  const rows = await sql`
    SELECT id, balance_type, balance_after, amount, direction, created_at, metadata
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
    ORDER BY created_at ASC, id ASC
    LIMIT 5000
  `;
  return (rows as any[]).map((row) => ({
    id: Number(row.id),
    balance_type: row.balance_type as string | null,
    balance_after: row.balance_after != null ? Number(row.balance_after) : null,
    amount: row.amount != null ? Number(row.amount) : null,
    direction: row.direction as string | null,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  }));
}

export type WalletAnalyticsPeriod = "week" | "month" | "quarter";

export type WalletAnalyticsResult = {
  period: WalletAnalyticsPeriod;
  series: { date: string; label: string; earnings: number; withdrawals: number }[];
  period_total_earnings: number;
  period_total_withdrawals: number;
  period_transaction_count: number;
  total_earned: number;
  total_withdrawn: number;
};

function istDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function istDateKeysForLastDays(dayCount: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    keys.push(istDateKeyFromIso(d.toISOString()));
  }
  return [...new Set(keys)];
}

function istDayLabel(dateKey: string, mode: "weekday" | "short"): string {
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateKey;
  if (mode === "weekday") {
    return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).format(d);
  }
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Earnings overview series — same rules as partnersite wallet/analytics. */
export async function getWalletAnalytics(
  storeId: number,
  period: WalletAnalyticsPeriod,
): Promise<WalletAnalyticsResult> {
  const sql = getSql();
  const walletId = await getOrCreateWalletId(storeId);
  const dayCount = period === "week" ? 7 : period === "month" ? 30 : 90;
  const dateKeys = istDateKeysForLastDays(dayCount);
  const rangeStartKey = dateKeys[0] ?? istDateKeyFromIso(new Date().toISOString());
  const rangeStartIso = `${rangeStartKey}T00:00:00+05:30`;

  const [walletRow] = await sql`
    SELECT total_earned, total_withdrawn FROM merchant_wallet WHERE id = ${walletId} LIMIT 1
  `;
  const ledgerRows = await sql`
    SELECT amount, direction, category, created_at
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND created_at >= ${rangeStartIso}::timestamptz
  `;

  const earningsByDay = new Map<string, number>();
  const withdrawalsByDay = new Map<string, number>();
  for (const k of dateKeys) {
    earningsByDay.set(k, 0);
    withdrawalsByDay.set(k, 0);
  }

  let period_transaction_count = 0;
  for (const row of ledgerRows as unknown as { amount: unknown; direction: string; category: string; created_at: Date | string }[]) {
    const cat = String(row.category ?? "").toUpperCase();
    const dir = String(row.direction ?? "").toUpperCase();
    const amt = Number(row.amount ?? 0);
    if (!(amt > 0)) continue;

    const isEarning =
      dir === "CREDIT" && (cat === "ORDER_EARNING" || cat === "ORDER_ADJUSTMENT");
    const isWithdrawal =
      (cat === "WITHDRAWAL" || cat === "WITHDRAWAL_DEBIT") && dir === "DEBIT";
    if (!isEarning && !isWithdrawal) continue;

    const created =
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    const key = istDateKeyFromIso(created);
    if (!earningsByDay.has(key)) continue;

    period_transaction_count += 1;
    if (isEarning) earningsByDay.set(key, (earningsByDay.get(key) ?? 0) + amt);
    else withdrawalsByDay.set(key, (withdrawalsByDay.get(key) ?? 0) + amt);
  }

  const series = dateKeys.map((date) => ({
    date,
    label: istDayLabel(date, period === "week" ? "weekday" : "short"),
    earnings: roundMoney(earningsByDay.get(date) ?? 0),
    withdrawals: roundMoney(withdrawalsByDay.get(date) ?? 0),
  }));

  let totalEarned = roundMoney(Number((walletRow as { total_earned?: number } | undefined)?.total_earned ?? 0));
  if (totalEarned <= 0) {
    const [sumRow] = await sql`
      SELECT COALESCE(SUM(amount), 0) AS s
      FROM merchant_wallet_ledger
      WHERE wallet_id = ${walletId}
        AND direction = 'CREDIT'
        AND category IN ('ORDER_EARNING', 'ORDER_ADJUSTMENT')
    `;
    totalEarned = roundMoney(Number((sumRow as { s?: number } | undefined)?.s ?? 0));
  }

  return {
    period,
    series,
    period_total_earnings: roundMoney(series.reduce((s, p) => s + p.earnings, 0)),
    period_total_withdrawals: roundMoney(series.reduce((s, p) => s + p.withdrawals, 0)),
    period_transaction_count,
    total_earned: totalEarned,
    total_withdrawn: roundMoney(
      Number((walletRow as { total_withdrawn?: number } | undefined)?.total_withdrawn ?? 0),
    ),
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
  if (amount > quote.max_payout_amount) {
    throw new Error(`Amount cannot exceed ₹${quote.max_payout_amount.toLocaleString("en-IN")}`);
  }

  const walletId = await getOrCreateWalletId(storeId);
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
  const pendingRows = await sql`
    SELECT COUNT(*)::int AS cnt FROM merchant_payout_requests
    WHERE wallet_id = ${walletId} AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
  `;
  const pendingCount = Number((pendingRows[0] as { cnt?: number })?.cnt ?? 0);
  if (pendingCount >= WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS) {
    throw new Error(`Maximum ${WALLET_CONSTANTS.MAX_PENDING_WITHDRAWALS} pending withdrawals allowed`);
  }

  let bank: {
    is_active?: boolean;
    is_disabled?: boolean;
    is_verified?: boolean;
    verification_status?: string;
    upi_verified?: boolean;
  } | undefined;
  try {
    const bankCheck = await sql`
      SELECT id, is_active, is_disabled, is_verified, verification_status, upi_verified
      FROM merchant_store_bank_accounts
      WHERE id = ${bankAccountId} AND store_id = ${storeId}
      LIMIT 1
    `;
    bank = bankCheck[0] as typeof bank;
    if (bankCheck.length === 0) throw new Error("Invalid bank account");
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid bank account") throw err;
    const fallback = await sql`
      SELECT id FROM merchant_store_bank_accounts WHERE id = ${bankAccountId} AND store_id = ${storeId} LIMIT 1
    `;
    if (fallback.length === 0) throw new Error("Invalid bank account");
    bank = undefined;
  }
  if (bank) {
    if (bank.is_disabled === true) throw new Error("Bank account is disabled");
    if (bank.is_active === false) throw new Error("Bank account is not active");
    const vs = String(bank.verification_status ?? "").trim().toLowerCase();
    const verified = bank.is_verified === true || vs === "verified" || bank.upi_verified === true;
    if (!verified) {
      throw new Error("Bank account is not verified. Verify the account before withdrawing.");
    }
  }

  const holdKey = idempotencyKey(
    "payout_hold",
    walletId,
    bankAccountId,
    Math.round(amount * 100),
    Math.floor(Date.now() / 120_000),
  );
  let holdLedgerId = 0;
  let created: Record<string, unknown> | undefined;
  try {
    await sql.begin(async (tx) => {
      const [locked] = await tx`
        SELECT status, frozen_reason, available_balance, hold_balance
        FROM merchant_wallet
        WHERE id = ${walletId}
        FOR UPDATE
      `;
      const status = String((locked as { status?: unknown } | undefined)?.status ?? "ACTIVE").toUpperCase();
      if (status === "FROZEN") {
        const freezeReason =
          typeof (locked as { frozen_reason?: unknown } | undefined)?.frozen_reason === "string"
            ? String((locked as { frozen_reason: string }).frozen_reason).trim() || null
            : null;
        throw Object.assign(
          new Error(
            freezeReason
              ? `Withdrawals are currently disabled. Reason: ${freezeReason}`
              : "Withdrawals are currently disabled.",
          ),
          { code: "WALLET_FROZEN", freezeReason },
        );
      }

      const [activePayouts] = await tx`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'PENDING' THEN net_payout_amount ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'PROCESSING') THEN net_payout_amount ELSE 0 END), 0) AS in_process
        FROM merchant_payout_requests
        WHERE wallet_id = ${walletId}
          AND status IN ('PENDING', 'APPROVED', 'PROCESSING')
      `;
      const buckets = computeMerchantWithdrawalBuckets({
        available_balance: Number((locked as { available_balance?: unknown })?.available_balance ?? 0),
        hold_balance: Number((locked as { hold_balance?: unknown })?.hold_balance ?? 0),
        pending_withdrawal_total: Number((activePayouts as { pending?: unknown })?.pending ?? 0),
        in_process_withdrawal_total: Number((activePayouts as { in_process?: unknown })?.in_process ?? 0),
      });
      if (amount > buckets.withdrawable_balance + 0.009) {
        throw new Error(
          `Insufficient withdrawable balance. Available to withdraw: ₹${buckets.withdrawable_balance.toFixed(2)}`,
        );
      }

      const [holdResult] = await tx`
        SELECT merchant_wallet_debit(
          ${walletId}, ${amount}, ${"HOLD_LOCK"}, ${"AVAILABLE"},
          ${"WITHDRAWAL"}, ${0}, ${holdKey},
          ${"Withdrawal hold"}, ${JSON.stringify({ net: quote.net_payout_amount })}::jsonb
        ) AS ledger_id
      `;
      holdLedgerId = Number((holdResult as { ledger_id?: number })?.ledger_id);

      await tx`
        SELECT merchant_wallet_credit(
          ${walletId}, ${amount}, ${"HOLD_LOCK"}, ${"HOLD"},
          ${"WITHDRAWAL"}, ${0}, ${holdKey + "_credit_hold"},
          ${"Withdrawal hold (hold bucket)"}, ${JSON.stringify({ hold_debit_ledger_id: holdLedgerId })}::jsonb
        )
      `;

      const [payoutRow] = await tx`
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
      created = payoutRow as Record<string, unknown>;
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "WALLET_FROZEN") throw err;
    const msg = err instanceof Error ? err.message : "";
    if (/wallet not allowed to debit/i.test(msg) && /FROZEN/i.test(msg)) {
      throw Object.assign(new Error("Withdrawals are currently disabled."), {
        code: "WALLET_FROZEN",
      });
    }
    throw err;
  }

  if (!created) throw new Error("Failed to create payout request");
  return {
    payout_request_id: Number(created.id),
    amount: Number(created.amount),
    commission_percentage: Number(created.commission_percentage),
    commission_amount: Number(created.commission_amount),
    net_payout_amount: Number(created.net_payout_amount),
    status: String(created.status) as PayoutResult["status"],
    hold_ledger_id: holdLedgerId,
  };
}
