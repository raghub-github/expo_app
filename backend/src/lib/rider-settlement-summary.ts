import { getSql } from "../db/client.js";

/**
 * Rider-facing view of one post-paid settlement (Person Ride or Parcel): how much
 * the customer owed, how much the rider collected in cash, what the rider earned,
 * and the wallet movement that reconciles the two. Read-only, from the immutable
 * ride_settlements row — never recomputed.
 */
export type RiderSettlementSummary = {
  settlementId: string;
  orderCoreId: number;
  orderId: string;
  serviceType: "person_ride" | "parcel";
  paymentMethod: "cash" | "online";
  /** What the customer was billed (the invoice total). */
  customerPayable: number;
  /** Cash the rider took from the customer — never a wallet credit. */
  cashCollected: number;
  /** What the customer paid to GatiMitra online (QR / in-app / GatiCash). */
  platformCollected: number;
  /** The rider's total earning for the job. */
  riderEntitlement: number;
  walletCredit: number;
  walletDebit: number;
  /** Signed: + credited to the wallet, − deducted from it. */
  walletImpact: number;
  platformShare: number;
  promotionalSubsidy: number;
  tax: number;
  tip: number;
  incentive: number;
  walletBalanceBefore: number | null;
  walletBalanceAfter: number | null;
  status: string;
  reconciliationStatus: string;
  settledAt: string;
  /** One-line explanation of the wallet movement, for the rider. */
  explanation: string;
};

type Row = {
  settlement_id: string;
  order_core_id: string | number;
  order_id_text: string;
  formatted_order_id: string | null;
  payment_mode: string;
  customer_bill: string;
  customer_paid: string;
  rider_earnings: string;
  wallet_credit: string;
  wallet_debit: string;
  company_commission: string;
  tax_total: string;
  status: string;
  posted_at: Date | string;
  metadata: Record<string, unknown> | null;
  // 0649 columns (absent before the migration)
  service_type?: string | null;
  cash_collected?: string | null;
  promotion_subsidy?: string | null;
  tip_amount?: string | null;
  incentive_amount?: string | null;
  wallet_balance_before?: string | null;
  wallet_balance_after?: string | null;
  reconciliation_status?: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const numOrNull = (v: unknown): number | null => (v == null || v === "" ? null : num(v));
const inr = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function explainSettlement(s: {
  paymentMethod: "cash" | "online";
  customerPayable: number;
  cashCollected: number;
  riderEntitlement: number;
  walletCredit: number;
  walletDebit: number;
}): string {
  if (s.paymentMethod === "online") {
    return `Customer paid ${inr(s.customerPayable)} online. Your earning of ${inr(s.walletCredit)} was credited to your wallet.`;
  }
  if (s.walletDebit > 0) {
    return `You collected ${inr(s.cashCollected)} in cash and earned ${inr(s.riderEntitlement)}. The ${inr(s.walletDebit)} difference is the platform's share, deducted from your wallet.`;
  }
  if (s.walletCredit > 0) {
    return `You collected ${inr(s.cashCollected)} in cash and earned ${inr(s.riderEntitlement)}. GatiMitra credited the ${inr(s.walletCredit)} difference to your wallet.`;
  }
  return `You collected ${inr(s.cashCollected)} in cash, exactly your earning. No wallet change.`;
}

function mapRow(row: Row): RiderSettlementSummary {
  const meta = row.metadata ?? {};
  const paymentMethod: "cash" | "online" = row.payment_mode === "cash" ? "cash" : "online";
  const customerPayable = num(row.customer_bill);
  const walletCredit = num(row.wallet_credit);
  const walletDebit = num(row.wallet_debit);
  const cashCollected =
    row.cash_collected != null && num(row.cash_collected) > 0
      ? num(row.cash_collected)
      : paymentMethod === "cash"
        ? customerPayable
        : 0;
  const riderEntitlement = num(row.rider_earnings);
  const fromMetaPaise = (key: string): number | null => {
    const v = Number(meta[key]);
    return Number.isFinite(v) ? Math.round(v) / 100 : null;
  };
  const summary = {
    settlementId: row.settlement_id,
    orderCoreId: Number(row.order_core_id),
    orderId: row.formatted_order_id?.trim() || row.order_id_text,
    serviceType: (row.service_type === "parcel" ? "parcel" : "person_ride") as
      | "person_ride"
      | "parcel",
    paymentMethod,
    customerPayable,
    cashCollected,
    platformCollected: paymentMethod === "online" ? num(row.customer_paid) : 0,
    riderEntitlement,
    walletCredit,
    walletDebit,
    walletImpact: Math.round((walletCredit - walletDebit) * 100) / 100,
    platformShare: fromMetaPaise("platformCommissionPaise") ?? num(row.company_commission),
    promotionalSubsidy: fromMetaPaise("promotionalSubsidyPaise") ?? num(row.promotion_subsidy),
    tax: num(row.tax_total),
    tip: num(row.tip_amount),
    incentive: num(row.incentive_amount),
    walletBalanceBefore: numOrNull(row.wallet_balance_before),
    walletBalanceAfter: numOrNull(row.wallet_balance_after),
    status: row.status,
    reconciliationStatus: row.reconciliation_status ?? "none",
    settledAt: new Date(row.posted_at).toISOString(),
  };
  return { ...summary, explanation: explainSettlement(summary) };
}

export async function getRiderSettlementSummary(
  riderId: number,
  orderCoreId: number
): Promise<RiderSettlementSummary | null> {
  if (!(riderId > 0) || !(orderCoreId > 0)) return null;
  const sql = getSql();
  let rows: Row[];
  try {
    rows = (await sql`
      SELECT s.settlement_id, s.order_core_id, s.order_id_text, c.formatted_order_id,
             s.payment_mode, s.customer_bill, s.customer_paid, s.rider_earnings,
             s.wallet_credit, s.wallet_debit, s.company_commission, s.tax_total,
             s.status, s.posted_at, s.metadata,
             s.service_type, s.cash_collected, s.promotion_subsidy, s.tip_amount,
             s.incentive_amount, s.wallet_balance_before, s.wallet_balance_after,
             s.reconciliation_status
      FROM ride_settlements s
      LEFT JOIN orders_core c ON c.id = s.order_core_id
      WHERE s.order_core_id = ${orderCoreId} AND s.rider_id = ${riderId}
      LIMIT 1
    `) as unknown as Row[];
  } catch {
    // Before migration 0649 the extension columns do not exist yet.
    rows = (await sql`
      SELECT s.settlement_id, s.order_core_id, s.order_id_text, c.formatted_order_id,
             s.payment_mode, s.customer_bill, s.customer_paid, s.rider_earnings,
             s.wallet_credit, s.wallet_debit, s.company_commission, s.tax_total,
             s.status, s.posted_at, s.metadata
      FROM ride_settlements s
      LEFT JOIN orders_core c ON c.id = s.order_core_id
      WHERE s.order_core_id = ${orderCoreId} AND s.rider_id = ${riderId}
      LIMIT 1
    `) as unknown as Row[];
  }
  const row = rows[0];
  return row ? mapRow(row) : null;
}

/** Resolve an order reference (core id, order_id or formatted id) for this rider. */
export async function resolveRiderOrderCoreId(riderId: number, orderRef: string): Promise<number | null> {
  const ref = orderRef.trim();
  if (!ref) return null;
  const sql = getSql();
  const rows = /^\d+$/.test(ref)
    ? await sql<Array<{ id: string | number }>>`
        SELECT id FROM orders_core WHERE id = ${Number(ref)} AND rider_id = ${riderId} LIMIT 1
      `
    : await sql<Array<{ id: string | number }>>`
        SELECT id FROM orders_core
        WHERE (order_id = ${ref} OR formatted_order_id = ${ref}) AND rider_id = ${riderId}
        LIMIT 1
      `;
  return rows[0] ? Number(rows[0].id) : null;
}
