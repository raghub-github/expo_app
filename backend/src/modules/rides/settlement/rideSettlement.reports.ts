/**
 * Ride Settlement — admin report aggregations.
 *
 * All numbers come off the immutable `ride_settlements` table, so the report
 * output matches exactly what the Hybrid Residual Take-Rate engine posted at
 * ride time. Zero recalculation, zero drift between "the money we tracked at
 * settlement" and "the money on the report".
 *
 * Range semantics: half-open [from, to) on `posted_at` in UTC. Callers should
 * pass ISO timestamps; helper `defaultReportRange()` picks the last 7 days.
 *
 * Each query is intentionally a single SQL statement so we can add richer
 * cross-cuts (by city, by rider, by vehicle) with the same pattern.
 */

import { getSql } from "../../../db/client.js";

export type RideReportRange = {
  fromIso: string;
  toIso: string;
};

export function defaultReportRange(): RideReportRange {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export type RideSettlementSummary = {
  range: RideReportRange;
  totals: {
    rides: number;
    customerBill: number;
    customerPaid: number;
    companyReceivable: number;
    companyReceived: number;
    riderEarnings: number;
    outstanding: number;
    walletDebit: number;
    walletCredit: number;
    commission: number;
    taxes: number;
    surgeTotal: number;
    surgeCustomerShare: number;
    surgeCompanyShare: number;
    discountTotal: number;
    couponDiscount: number;
    companyFundedDiscount: number;
  };
  byPaymentMode: Array<{
    paymentMode: "online" | "cash" | "wallet" | "mixed";
    rides: number;
    customerBill: number;
    companyReceivable: number;
    companyReceived: number;
    riderEarnings: number;
    outstanding: number;
  }>;
  byStatus: Array<{
    status: "pending" | "settled" | "failed" | "reversed";
    rides: number;
    outstanding: number;
  }>;
};

export type CashRecoveryReport = {
  range: RideReportRange;
  cashRides: number;
  cashCustomerBill: number;
  cashCompanyReceivable: number;
  cashWalletDebit: number;
  outstandingCashCompany: number;
  topRiders: Array<{
    riderId: number;
    rides: number;
    companyReceivable: number;
    walletDebit: number;
  }>;
};

export type NegativeWalletWatchlist = Array<{
  riderId: number;
  currentBalance: number;
  serviceNegativeUsage: number;
  blockedServices: string[];
  blockReason: string | null;
  lastBlockedAt: string | null;
}>;

function n(v: unknown): number {
  if (v == null) return 0;
  const parsed = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function loadRideSettlementSummary(
  range: RideReportRange = defaultReportRange()
): Promise<RideSettlementSummary> {
  const sql = getSql();
  const from = new Date(range.fromIso);
  const to = new Date(range.toIso);

  const [totalsRow] = await sql<
    Array<Record<string, unknown>>
  >`
    SELECT
      COUNT(*)::int AS rides,
      COALESCE(SUM(customer_bill), 0)::text AS customer_bill,
      COALESCE(SUM(customer_paid), 0)::text AS customer_paid,
      COALESCE(SUM(company_receivable), 0)::text AS company_receivable,
      COALESCE(SUM(company_received), 0)::text AS company_received,
      COALESCE(SUM(rider_earnings), 0)::text AS rider_earnings,
      COALESCE(SUM(outstanding_amount), 0)::text AS outstanding,
      COALESCE(SUM(wallet_debit), 0)::text AS wallet_debit,
      COALESCE(SUM(wallet_credit), 0)::text AS wallet_credit,
      COALESCE(SUM(company_commission), 0)::text AS commission,
      COALESCE(SUM(tax_total), 0)::text AS taxes,
      COALESCE(SUM(surge_total), 0)::text AS surge_total,
      COALESCE(SUM(surge_customer_share), 0)::text AS surge_customer_share,
      COALESCE(SUM(surge_company_share), 0)::text AS surge_company_share,
      COALESCE(SUM(discount_total), 0)::text AS discount_total,
      COALESCE(SUM(coupon_discount), 0)::text AS coupon_discount,
      COALESCE(SUM(company_funded_discount), 0)::text AS company_funded_discount
    FROM ride_settlements
    WHERE posted_at >= ${from} AND posted_at < ${to}
      AND status <> 'reversed'
  `;

  const byModeRows = await sql<Array<Record<string, unknown>>>`
    SELECT
      payment_mode,
      COUNT(*)::int AS rides,
      COALESCE(SUM(customer_bill), 0)::text AS customer_bill,
      COALESCE(SUM(company_receivable), 0)::text AS company_receivable,
      COALESCE(SUM(company_received), 0)::text AS company_received,
      COALESCE(SUM(rider_earnings), 0)::text AS rider_earnings,
      COALESCE(SUM(outstanding_amount), 0)::text AS outstanding
    FROM ride_settlements
    WHERE posted_at >= ${from} AND posted_at < ${to}
      AND status <> 'reversed'
    GROUP BY payment_mode
    ORDER BY payment_mode ASC
  `;

  const byStatusRows = await sql<Array<Record<string, unknown>>>`
    SELECT
      status,
      COUNT(*)::int AS rides,
      COALESCE(SUM(outstanding_amount), 0)::text AS outstanding
    FROM ride_settlements
    WHERE posted_at >= ${from} AND posted_at < ${to}
    GROUP BY status
    ORDER BY status ASC
  `;

  return {
    range,
    totals: {
      rides: Number((totalsRow?.rides as number | string) ?? 0),
      customerBill: n(totalsRow?.customer_bill),
      customerPaid: n(totalsRow?.customer_paid),
      companyReceivable: n(totalsRow?.company_receivable),
      companyReceived: n(totalsRow?.company_received),
      riderEarnings: n(totalsRow?.rider_earnings),
      outstanding: n(totalsRow?.outstanding),
      walletDebit: n(totalsRow?.wallet_debit),
      walletCredit: n(totalsRow?.wallet_credit),
      commission: n(totalsRow?.commission),
      taxes: n(totalsRow?.taxes),
      surgeTotal: n(totalsRow?.surge_total),
      surgeCustomerShare: n(totalsRow?.surge_customer_share),
      surgeCompanyShare: n(totalsRow?.surge_company_share),
      discountTotal: n(totalsRow?.discount_total),
      couponDiscount: n(totalsRow?.coupon_discount),
      companyFundedDiscount: n(totalsRow?.company_funded_discount),
    },
    byPaymentMode: byModeRows.map((r) => ({
      paymentMode: String(r.payment_mode) as "online" | "cash" | "wallet" | "mixed",
      rides: Number(r.rides ?? 0),
      customerBill: n(r.customer_bill),
      companyReceivable: n(r.company_receivable),
      companyReceived: n(r.company_received),
      riderEarnings: n(r.rider_earnings),
      outstanding: n(r.outstanding),
    })),
    byStatus: byStatusRows.map((r) => ({
      status: String(r.status) as "pending" | "settled" | "failed" | "reversed",
      rides: Number(r.rides ?? 0),
      outstanding: n(r.outstanding),
    })),
  };
}

export async function loadCashRecoveryReport(
  range: RideReportRange = defaultReportRange(),
  topRidersLimit = 10
): Promise<CashRecoveryReport> {
  const sql = getSql();
  const from = new Date(range.fromIso);
  const to = new Date(range.toIso);

  const [totals] = await sql<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*)::int AS rides,
      COALESCE(SUM(customer_bill), 0)::text AS customer_bill,
      COALESCE(SUM(company_receivable), 0)::text AS company_receivable,
      COALESCE(SUM(wallet_debit), 0)::text AS wallet_debit,
      COALESCE(SUM(outstanding_amount), 0)::text AS outstanding
    FROM ride_settlements
    WHERE posted_at >= ${from} AND posted_at < ${to}
      AND payment_mode = 'cash'
      AND status <> 'reversed'
  `;

  const topRiders = await sql<Array<Record<string, unknown>>>`
    SELECT
      rider_id,
      COUNT(*)::int AS rides,
      COALESCE(SUM(company_receivable), 0)::text AS company_receivable,
      COALESCE(SUM(wallet_debit), 0)::text AS wallet_debit
    FROM ride_settlements
    WHERE posted_at >= ${from} AND posted_at < ${to}
      AND payment_mode = 'cash'
      AND status <> 'reversed'
      AND rider_id IS NOT NULL
    GROUP BY rider_id
    ORDER BY SUM(company_receivable) DESC
    LIMIT ${topRidersLimit}
  `;

  return {
    range,
    cashRides: Number(totals?.rides ?? 0),
    cashCustomerBill: n(totals?.customer_bill),
    cashCompanyReceivable: n(totals?.company_receivable),
    cashWalletDebit: n(totals?.wallet_debit),
    outstandingCashCompany: n(totals?.outstanding),
    topRiders: topRiders.map((r) => ({
      riderId: Number(r.rider_id),
      rides: Number(r.rides ?? 0),
      companyReceivable: n(r.company_receivable),
      walletDebit: n(r.wallet_debit),
    })),
  };
}

/**
 * List riders whose total wallet balance is currently negative — the pool
 * that the Super Admin's `ride_wallet_config` policy governs. Joins the most
 * recent negative-wallet / global-emergency block history entry so the ops
 * team can see WHY each rider is on the watchlist.
 *
 * Excludes fraud / manual / compliance blocks by filtering on `reason` — those
 * blocks have their own admin surface and must not be auto-cleared.
 */
export async function loadNegativeWalletWatchlist(
  limit = 50
): Promise<NegativeWalletWatchlist> {
  const sql = getSql();
  const rows = await sql<Array<Record<string, unknown>>>`
    WITH latest_block AS (
      SELECT DISTINCT ON (rider_id, service_type)
        rider_id,
        service_type,
        action,
        reason,
        created_at
      FROM rider_service_block_history
      WHERE reason IN ('negative_wallet', 'global_emergency')
      ORDER BY rider_id, service_type, created_at DESC
    ),
    active_block AS (
      SELECT rider_id,
             ARRAY_AGG(service_type) AS services,
             MAX(reason)             AS reason,
             MAX(created_at)         AS last_blocked_at
      FROM latest_block
      WHERE action = 'block'
      GROUP BY rider_id
    )
    SELECT
      w.rider_id,
      w.total_balance::text                       AS total_balance,
      w.negative_used_person_ride::text           AS negative_used_person_ride,
      w.negative_used_food::text                  AS negative_used_food,
      w.negative_used_parcel::text                AS negative_used_parcel,
      COALESCE(ab.services, ARRAY[]::text[])      AS services,
      ab.reason                                   AS reason,
      ab.last_blocked_at                          AS last_blocked_at
    FROM rider_wallet w
    LEFT JOIN active_block ab ON ab.rider_id = w.rider_id
    WHERE w.total_balance < 0
       OR ab.rider_id IS NOT NULL
    ORDER BY w.total_balance ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => {
    const services = Array.isArray(r.services)
      ? (r.services as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
      : [];
    const lastBlocked = r.last_blocked_at;
    const perService =
      n(r.negative_used_person_ride) +
      n(r.negative_used_food) +
      n(r.negative_used_parcel);
    return {
      riderId: Number(r.rider_id),
      currentBalance: n(r.total_balance),
      serviceNegativeUsage: Math.round(perService * 100) / 100,
      blockedServices: services,
      blockReason: r.reason == null ? null : String(r.reason),
      lastBlockedAt:
        lastBlocked instanceof Date
          ? lastBlocked.toISOString()
          : lastBlocked
            ? String(lastBlocked)
            : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Post-paid settlement ledger (Person Ride + Parcel) — one row per job, with
// the cash/online split, the wallet movement and its reconciliation state.
// Requires migration 0649.
// ---------------------------------------------------------------------------

export type SettlementListFilters = RideReportRange & {
  service?: "person_ride" | "parcel";
  method?: "cash" | "online";
  status?: "pending" | "settled" | "failed" | "reversed";
  reconciliation?: "none" | "required" | "resolved";
  /** Order id / formatted order id / settlement id. */
  q?: string;
  limit: number;
  offset: number;
};

export type SettlementListRow = {
  settlementId: string;
  orderCoreId: number;
  orderId: string;
  riderId: number | null;
  customerId: number | null;
  serviceType: "person_ride" | "parcel";
  paymentMode: string;
  customerPayable: number;
  customerPaid: number;
  cashCollected: number;
  riderEntitlement: number;
  walletCredit: number;
  walletDebit: number;
  platformShare: number;
  promotionalSubsidy: number;
  tax: number;
  tip: number;
  incentive: number;
  discount: number;
  walletBalanceBefore: number | null;
  walletBalanceAfter: number | null;
  gatewayPaymentId: string | null;
  status: string;
  reconciliationStatus: string;
  reconciliationReason: string | null;
  postedAt: string;
};

export async function listPostpaidSettlements(
  f: SettlementListFilters
): Promise<{ items: SettlementListRow[]; total: number }> {
  const sql = getSql();
  const from = new Date(f.fromIso);
  const to = new Date(f.toIso);
  const q = f.q?.trim() || null;
  const where = sql`
    s.posted_at >= ${from} AND s.posted_at < ${to}
    ${f.service ? sql`AND s.service_type = ${f.service}` : sql``}
    ${f.method === "cash" ? sql`AND s.payment_mode = 'cash'` : sql``}
    ${f.method === "online" ? sql`AND s.payment_mode <> 'cash'` : sql``}
    ${f.status ? sql`AND s.status = ${f.status}` : sql``}
    ${f.reconciliation ? sql`AND s.reconciliation_status = ${f.reconciliation}` : sql``}
    ${
      q
        ? sql`AND (s.settlement_id = ${q} OR s.order_id_text = ${q} OR c.formatted_order_id = ${q})`
        : sql``
    }
  `;
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT s.settlement_id, s.order_core_id, s.order_id_text, c.formatted_order_id,
           s.rider_id, s.customer_id, s.service_type, s.payment_mode,
           s.customer_bill, s.customer_paid, s.cash_collected, s.rider_earnings,
           s.wallet_credit, s.wallet_debit, s.company_commission, s.promotion_subsidy,
           s.tax_total, s.tip_amount, s.incentive_amount, s.discount_total,
           s.wallet_balance_before, s.wallet_balance_after, s.razorpay_payment_id,
           s.status, s.reconciliation_status, s.reconciliation_reason, s.posted_at,
           s.metadata->>'platformCommissionPaise' AS commission_paise,
           s.metadata->>'promotionalSubsidyPaise' AS subsidy_paise,
           COUNT(*) OVER () AS total
    FROM ride_settlements s
    LEFT JOIN orders_core c ON c.id = s.order_core_id
    WHERE ${where}
    ORDER BY s.posted_at DESC
    LIMIT ${f.limit} OFFSET ${f.offset}
  `;
  const nullable = (v: unknown) => (v == null ? null : n(v));
  const items = rows.map((r) => ({
    settlementId: String(r.settlement_id),
    orderCoreId: Number(r.order_core_id),
    orderId: String((r.formatted_order_id as string | null)?.trim() || r.order_id_text),
    riderId: r.rider_id == null ? null : Number(r.rider_id),
    customerId: r.customer_id == null ? null : Number(r.customer_id),
    serviceType: (r.service_type === "parcel" ? "parcel" : "person_ride") as "person_ride" | "parcel",
    paymentMode: String(r.payment_mode),
    customerPayable: n(r.customer_bill),
    customerPaid: n(r.customer_paid),
    cashCollected: n(r.cash_collected),
    riderEntitlement: n(r.rider_earnings),
    walletCredit: n(r.wallet_credit),
    walletDebit: n(r.wallet_debit),
    platformShare: r.commission_paise != null ? n(Number(r.commission_paise) / 100) : n(r.company_commission),
    promotionalSubsidy: r.subsidy_paise != null ? n(Number(r.subsidy_paise) / 100) : n(r.promotion_subsidy),
    tax: n(r.tax_total),
    tip: n(r.tip_amount),
    incentive: n(r.incentive_amount),
    discount: n(r.discount_total),
    walletBalanceBefore: nullable(r.wallet_balance_before),
    walletBalanceAfter: nullable(r.wallet_balance_after),
    gatewayPaymentId: (r.razorpay_payment_id as string | null) ?? null,
    status: String(r.status),
    reconciliationStatus: String(r.reconciliation_status ?? "none"),
    reconciliationReason: (r.reconciliation_reason as string | null) ?? null,
    postedAt: new Date(r.posted_at as string).toISOString(),
  }));
  return { items, total: rows.length > 0 ? Number(rows[0]!.total) : 0 };
}

/**
 * Close a reconciliation item. Records the admin's decision only — any money
 * correction goes through the audited wallet adjustment tools, never by editing
 * the settlement or the ledger.
 */
export async function resolveSettlementReconciliation(args: {
  settlementId: string;
  note: string;
  actor: string;
}): Promise<boolean> {
  const sql = getSql();
  const stamp = `resolved by ${args.actor} at ${new Date().toISOString()}: ${args.note}`;
  const rows = await sql<Array<{ order_core_id: string | number; rider_id: number | null }>>`
    UPDATE ride_settlements
    SET reconciliation_status = 'resolved',
        reconciliation_reason = concat_ws(' | ', NULLIF(reconciliation_reason, ''), ${stamp}::text),
        updated_at = NOW()
    WHERE settlement_id = ${args.settlementId}
      AND reconciliation_status = 'required'
    RETURNING order_core_id, rider_id
  `;
  const row = rows[0];
  if (!row) return false;
  try {
    const { recordRideBillingActivity } = await import("./rideBillingActivity.js");
    await recordRideBillingActivity({
      orderCoreId: Number(row.order_core_id),
      riderId: row.rider_id,
      eventType: "SETTLEMENT_RECONCILIATION_RESOLVED",
      summary: stamp,
      payload: { settlementId: args.settlementId },
      actorType: "admin",
      actorId: args.actor,
    });
  } catch {
    /* audit row is best-effort; the settlement row carries the stamp */
  }
  return true;
}
