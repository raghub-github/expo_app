/**
 * Merchant payout settlement — DB aggregation layer.
 * Formula SSOT: @gatimitra/merchant-payout.
 * CLOSED cycles serve locked merchant_payout_summaries snapshots.
 */
import { roundMoney } from "@gatimitra/contracts";
import {
  buildSummaryFromParts,
  computeSettlementFromLedgerEntries,
  summaryFromLockedSnapshot,
  type MerchantPayoutSettlementSummary,
} from "@gatimitra/merchant-payout";
import { getSql } from "../db/client.js";

export type { MerchantPayoutSettlementSummary };
export { computeSettlementFromLedgerEntries };

type OrderAggRow = {
  order_count: number;
  rejected_order_count: number;
  item_subtotal: number;
  packaging_charges: number;
  merchant_net_total: number;
  coupon_offer_discount: number;
  percentage_flat_offer_discount: number;
  combo_offer_discount: number;
  free_delivery_offer_discount: number;
  mechanism_fee: number;
  cancellation_compensation: number;
};

type LedgerAggRow = {
  other_credits: number;
  withdrawal_reversal_credits: number;
  manual_credits: number;
  adjustment_credits: number;
  gst_credits: number;
  penalty_reversal_credits: number;
  penalties: number;
  refund_adjustments: number;
  manual_debit_adjustments: number;
  chargebacks: number;
  cancel_comp_ledger: number;
};

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/** Aggregate A/B informational fields from ORDER_EARNING credits + OSB. */
async function aggregateSettlementFromBreakdown(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<OrderAggRow | null> {
  const sql = getSql();
  try {
    const [row] = (await sql`
      WITH period_orders AS (
        SELECT DISTINCT ON (l.reference_id)
          l.reference_id AS orders_food_id,
          l.amount AS ledger_amount,
          l.commission_amount AS ledger_commission,
          f.order_id
        FROM merchant_wallet_ledger l
        LEFT JOIN public.orders_food f ON f.id = l.reference_id
        WHERE l.wallet_id = ${walletId}
          AND l.reference_id IS NOT NULL
          AND l.created_at >= ${periodStart.toISOString()}::timestamptz
          AND l.created_at < ${periodEnd.toISOString()}::timestamptz
          AND l.direction = 'CREDIT'
          AND l.category = 'ORDER_EARNING'
        ORDER BY l.reference_id, l.created_at DESC
      )
      SELECT
        COUNT(*)::int AS order_count,
        0::int AS rejected_order_count,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(osb.item_total, 0) > 0 THEN osb.item_total
            WHEN COALESCE(oc.item_total, 0) > 0 THEN oc.item_total
            WHEN COALESCE(oc.total_ctm, 0) > 0 THEN GREATEST(0, oc.total_ctm - COALESCE(osb.packaging_charge, 0))
            ELSE GREATEST(0, po.ledger_amount - COALESCE(osb.packaging_charge, 0))
          END
        ), 0) AS item_subtotal,
        COALESCE(SUM(COALESCE(osb.packaging_charge, 0)), 0) AS packaging_charges,
        COALESCE(SUM(po.ledger_amount), 0) AS merchant_net_total,
        COALESCE(SUM(
          COALESCE(
            NULLIF(osb.coupon_offer_discount, 0),
            NULLIF(osb.promo_discount, 0),
            osb.coupon_discount,
            0
          )
        ), 0) AS coupon_offer_discount,
        COALESCE(SUM(
          COALESCE(
            NULLIF(osb.percentage_flat_offer_discount, 0),
            NULLIF(osb.other_restaurant_discount, 0),
            osb.merchant_funded_discount,
            0
          )
        ), 0) AS percentage_flat_offer_discount,
        COALESCE(SUM(COALESCE(osb.combo_offer_discount, 0)), 0) AS combo_offer_discount,
        COALESCE(SUM(
          COALESCE(
            NULLIF(osb.free_delivery_offer_discount, 0),
            NULLIF(osb.delivery_charge_discount, 0),
            0
          )
        ), 0) AS free_delivery_offer_discount,
        COALESCE(SUM(
          COALESCE(
            NULLIF(osb.payment_mechanism_fee, 0),
            osb.commission_amount,
            po.ledger_commission,
            0
          )
        ), 0) AS mechanism_fee,
        COALESCE(SUM(COALESCE(osb.cancellation_compensation, 0)), 0) AS cancellation_compensation
      FROM period_orders po
      LEFT JOIN public.order_settlement_breakdown osb ON osb.order_id = po.order_id
      LEFT JOIN public.orders_core oc ON oc.id = po.order_id
    `) as OrderAggRow[];
    return row ?? null;
  } catch {
    return null;
  }
}

async function aggregateLedgerDeductionsAndCredits(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<LedgerAggRow> {
  const sql = getSql();
  const empty: LedgerAggRow = {
    other_credits: 0,
    withdrawal_reversal_credits: 0,
    manual_credits: 0,
    adjustment_credits: 0,
    gst_credits: 0,
    penalty_reversal_credits: 0,
    penalties: 0,
    refund_adjustments: 0,
    manual_debit_adjustments: 0,
    chargebacks: 0,
    cancel_comp_ledger: 0,
  };
  try {
    const [row] = (await sql`
      SELECT
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT'
            AND l.category::text IN (
              'FAILED_WITHDRAWAL_REVERSAL',
              'WITHDRAWAL_REVERSAL',
              'MANUAL_CREDIT',
              'ADJUSTMENT_CREDIT',
              'GST_CREDIT',
              'PENALTY_REVERSAL'
            )
        ), 0) AS other_credits,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT'
            AND l.category::text IN ('FAILED_WITHDRAWAL_REVERSAL', 'WITHDRAWAL_REVERSAL')
        ), 0) AS withdrawal_reversal_credits,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT' AND l.category::text = 'MANUAL_CREDIT'
        ), 0) AS manual_credits,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT' AND l.category::text = 'ADJUSTMENT_CREDIT'
        ), 0) AS adjustment_credits,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT' AND l.category::text = 'GST_CREDIT'
        ), 0) AS gst_credits,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT' AND l.category::text = 'PENALTY_REVERSAL'
        ), 0) AS penalty_reversal_credits,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'DEBIT'
            AND l.category::text = 'PENALTY'
            AND COALESCE(l.metadata->>'pending', 'false') NOT IN ('true', '1')
            AND COALESCE(l.metadata->>'status', '') NOT ILIKE '%pending%'
            AND COALESCE(l.metadata->>'finalized', 'true') NOT IN ('false', '0')
        ), 0) AS penalties,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'DEBIT'
            AND (
              l.category::text IN ('REFUND_DEBIT', 'REFUND_TO_CUSTOMER')
              OR (
                COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
                AND COALESCE(l.metadata->>'balance_impact', '') = 'debit'
              )
            )
        ), 0) AS refund_adjustments,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'DEBIT'
            AND l.category::text IN ('MANUAL_DEBIT', 'ADJUSTMENT_DEBIT')
        ), 0) AS manual_debit_adjustments,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'DEBIT'
            AND (
              l.category::text ILIKE '%CHARGEBACK%'
              OR COALESCE(l.metadata->>'type', '') ILIKE '%chargeback%'
              OR COALESCE(l.description, '') ILIKE '%chargeback%'
            )
        ), 0) AS chargebacks,
        COALESCE(SUM(l.amount) FILTER (
          WHERE l.direction = 'CREDIT'
            AND l.category = 'ORDER_ADJUSTMENT'
            AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
            AND COALESCE(l.metadata->>'balance_impact', '') = 'credit'
        ), 0) AS cancel_comp_ledger
      FROM merchant_wallet_ledger l
      WHERE l.wallet_id = ${walletId}
        AND l.created_at >= ${periodStart.toISOString()}::timestamptz
        AND l.created_at < ${periodEnd.toISOString()}::timestamptz
    `) as LedgerAggRow[];
    return {
      other_credits: n(row?.other_credits),
      withdrawal_reversal_credits: n(row?.withdrawal_reversal_credits),
      manual_credits: n(row?.manual_credits),
      adjustment_credits: n(row?.adjustment_credits),
      gst_credits: n(row?.gst_credits),
      penalty_reversal_credits: n(row?.penalty_reversal_credits),
      penalties: n(row?.penalties),
      refund_adjustments: n(row?.refund_adjustments),
      manual_debit_adjustments: n(row?.manual_debit_adjustments),
      chargebacks: n(row?.chargebacks),
      cancel_comp_ledger: n(row?.cancel_comp_ledger),
    };
  } catch {
    return empty;
  }
}

async function countRejectedCancellations(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const sql = getSql();
  try {
    const [row] = (await sql`
      SELECT COUNT(DISTINCT COALESCE(l.reference_id::text, l.id::text))::int AS cnt
      FROM merchant_wallet_ledger l
      WHERE l.wallet_id = ${walletId}
        AND l.created_at >= ${periodStart.toISOString()}::timestamptz
        AND l.created_at < ${periodEnd.toISOString()}::timestamptz
        AND l.category = 'ORDER_ADJUSTMENT'
        AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
    `) as { cnt: number }[];
    return n(row?.cnt);
  } catch {
    return 0;
  }
}

function buildFromPartsAndLedger(
  breakdown: OrderAggRow | null,
  ledgerAgg: LedgerAggRow,
  rejectedCount: number,
): MerchantPayoutSettlementSummary {
  const merchantNet = n(breakdown?.merchant_net_total);
  const cancelComp = Math.max(
    n(breakdown?.cancellation_compensation),
    ledgerAgg.cancel_comp_ledger,
  );

  return buildSummaryFromParts({
    itemSubtotal: n(breakdown?.item_subtotal) || merchantNet,
    packagingCharges: n(breakdown?.packaging_charges),
    couponOfferDiscount: n(breakdown?.coupon_offer_discount),
    percentageFlatOfferDiscount: n(breakdown?.percentage_flat_offer_discount),
    comboOfferDiscount: n(breakdown?.combo_offer_discount),
    freeDeliveryOfferDiscount: n(breakdown?.free_delivery_offer_discount),
    mechanismFee: n(breakdown?.mechanism_fee),
    deliveredOrderCount: n(breakdown?.order_count),
    rejectedOrderCount: rejectedCount,
    cancellationCompensation: cancelComp,
    merchantNetTotal: merchantNet,
    otherCredits: ledgerAgg.other_credits,
    withdrawalReversalCredits: ledgerAgg.withdrawal_reversal_credits,
    manualCredits: ledgerAgg.manual_credits,
    adjustmentCredits: ledgerAgg.adjustment_credits,
    gstCredits: ledgerAgg.gst_credits,
    penaltyReversalCredits: ledgerAgg.penalty_reversal_credits,
    penalties: ledgerAgg.penalties,
    refundAdjustments: ledgerAgg.refund_adjustments,
    manualDebitAdjustments: ledgerAgg.manual_debit_adjustments,
    chargebacks: ledgerAgg.chargebacks,
    includeMechanismFeeInDeductions: false,
  });
}

async function computeLiveSettlement(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
  storeId: number,
): Promise<MerchantPayoutSettlementSummary> {
  const [breakdown, ledgerAgg, rejectedCount] = await Promise.all([
    aggregateSettlementFromBreakdown(walletId, periodStart, periodEnd),
    aggregateLedgerDeductionsAndCredits(walletId, periodStart, periodEnd),
    countRejectedCancellations(walletId, periodStart, periodEnd),
  ]);

  if (breakdown && n(breakdown.order_count) > 0) {
    return buildFromPartsAndLedger(breakdown, ledgerAgg, rejectedCount);
  }

  // No ORDER_EARNING rows — still include other credits / deductions (e.g. reject return cycle)
  if (
    ledgerAgg.other_credits > 0 ||
    ledgerAgg.penalties > 0 ||
    ledgerAgg.refund_adjustments > 0 ||
    ledgerAgg.manual_debit_adjustments > 0 ||
    ledgerAgg.chargebacks > 0 ||
    ledgerAgg.cancel_comp_ledger > 0
  ) {
    return buildFromPartsAndLedger(
      {
        order_count: 0,
        rejected_order_count: rejectedCount,
        item_subtotal: 0,
        packaging_charges: 0,
        merchant_net_total: 0,
        coupon_offer_discount: 0,
        percentage_flat_offer_discount: 0,
        combo_offer_discount: 0,
        free_delivery_offer_discount: 0,
        mechanism_fee: 0,
        cancellation_compensation: 0,
      },
      ledgerAgg,
      rejectedCount,
    );
  }

  const { queryLedgerForSettlement } = await import("./merchant-wallet-engine.js");
  const { entries } = await queryLedgerForSettlement(storeId, periodStart, periodEnd);
  return computeSettlementFromLedgerEntries(entries);
}

async function getLockedSummaryForCycle(
  cycleId: number,
): Promise<MerchantPayoutSettlementSummary | null> {
  const sql = getSql();
  try {
    const [row] = await sql`
      SELECT s.*
      FROM merchant_payout_summaries s
      JOIN merchant_payout_cycles c ON c.summary_id = s.id
      WHERE c.id = ${cycleId}
        AND c.status = 'CLOSED'
        AND s.status = 'LOCKED'
      LIMIT 1
    `;
    if (!row) return null;
    return summaryFromLockedSnapshot(row as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function resolveCycleWindow(
  walletId: number,
  cycleId?: number | null,
): Promise<{
  cycleId: number | null;
  status: "OPEN" | "CLOSED" | null;
  periodStart: Date;
  periodEnd: Date;
} | null> {
  const sql = getSql();
  try {
    if (cycleId != null && Number.isFinite(cycleId) && cycleId > 0) {
      const [row] = await sql`
        SELECT id, status, period_start, period_end
        FROM merchant_payout_cycles
        WHERE id = ${cycleId} AND wallet_id = ${walletId}
        LIMIT 1
      `;
      if (!row) return null;
      return {
        cycleId: Number(row.id),
        status: String(row.status) as "OPEN" | "CLOSED",
        periodStart: new Date(row.period_start as string),
        periodEnd: row.period_end
          ? new Date(row.period_end as string)
          : new Date(),
      };
    }

    // Prefer matching OPEN cycle; else find cycle covering [from,to)
    const [open] = await sql`
      SELECT id, status, period_start, period_end
      FROM merchant_payout_cycles
      WHERE wallet_id = ${walletId} AND status = 'OPEN'
      LIMIT 1
    `;
    if (open) {
      return {
        cycleId: Number(open.id),
        status: "OPEN",
        periodStart: new Date(open.period_start as string),
        periodEnd: new Date(),
      };
    }
  } catch {
    // table may not exist yet pre-migration
  }
  return null;
}

export async function getPayoutSettlement(
  storeId: number,
  periodStart: Date,
  periodEnd: Date,
  opts?: { cycleId?: number | null },
): Promise<MerchantPayoutSettlementSummary> {
  const { getOrCreateWallet } = await import("./merchant-wallet-engine.js");
  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;

  // Ensure open cycle exists (no-op if migration not applied)
  try {
    const sql = getSql();
    await sql`SELECT public.ensure_open_merchant_payout_cycle(${walletId})`;
  } catch {
    // ignore
  }

  if (opts?.cycleId != null) {
    const locked = await getLockedSummaryForCycle(opts.cycleId);
    if (locked) return locked;

    const window = await resolveCycleWindow(walletId, opts.cycleId);
    if (window) {
      return computeLiveSettlement(walletId, window.periodStart, window.periodEnd, storeId);
    }
  }

  // If request window matches a CLOSED cycle, prefer snapshot
  try {
    const sql = getSql();
    const [closed] = await sql`
      SELECT c.id
      FROM merchant_payout_cycles c
      WHERE c.wallet_id = ${walletId}
        AND c.status = 'CLOSED'
        AND c.period_start = ${periodStart.toISOString()}::timestamptz
        AND c.period_end = ${periodEnd.toISOString()}::timestamptz
      LIMIT 1
    `;
    if (closed?.id != null) {
      const locked = await getLockedSummaryForCycle(Number(closed.id));
      if (locked) return locked;
    }
  } catch {
    // ignore
  }

  // Half-open period: treat `to` as exclusive end-of-day inclusive callers by adding epsilon
  // Existing clients pass end-of-day inclusive; use <= for live path via end + 1ms exclusive
  const exclusiveEnd = new Date(periodEnd.getTime() + 1);
  return computeLiveSettlement(walletId, periodStart, exclusiveEnd, storeId);
}

export type MerchantPayoutCycleDto = {
  id: number;
  status: "OPEN" | "CLOSED";
  close_reason: string | null;
  period_start: string;
  period_end: string | null;
  payout_request_id: number | null;
  net_payout: number;
  estimated_payout: number;
  order_count: number;
  /** Withdrawal returned because this cycle's withdrawal was rejected/failed — never part of net_payout. */
  withdrawal_returned: number;
  /** Amount the merchant had requested on the withdrawal that closed this cycle. */
  withdrawal_amount: number;
  /** Admin rejection / bank failure reason for the closing withdrawal. */
  close_note: string | null;
  settlement: MerchantPayoutSettlementSummary | null;
};

export async function listPayoutCycles(
  storeId: number,
  limit = 50,
): Promise<MerchantPayoutCycleDto[]> {
  const { getOrCreateWallet } = await import("./merchant-wallet-engine.js");
  const wallet = await getOrCreateWallet(storeId);
  const walletId = wallet.id;
  const sql = getSql();

  try {
    await sql`SELECT public.ensure_open_merchant_payout_cycle(${walletId})`;
  } catch {
    // ignore
  }

  try {
    const rows = await sql`
      SELECT
        c.id,
        c.status,
        c.close_reason,
        c.period_start,
        c.period_end,
        c.payout_request_id,
        s.net_payout,
        s.estimated_payout,
        s.delivered_orders,
        s.rejected_orders,
        s.net_order_value,
        s.item_subtotal,
        s.packaging_charges,
        s.restaurant_discounts,
        s.coupon_offer_discount,
        s.percentage_flat_offer_discount,
        s.combo_offer_discount,
        s.free_delivery_offer_discount,
        s.order_deductions,
        s.payment_mechanism_fee AS mechanism_fee,
        s.customer_compensation,
        s.cancellation_compensation,
        s.other_credits,
        -- Read through to_jsonb so an un-migrated DB (no 0481) degrades to 0
        -- instead of erroring out the whole payout list.
        COALESCE((to_jsonb(s) ->> 'withdrawal_reversal_credits')::numeric, 0)
          AS withdrawal_reversal_credits,
        s.penalties,
        s.refund_adjustments,
        s.manual_debit_adjustments,
        s.chargebacks,
        pr.amount AS request_amount,
        pr.rejection_reason,
        pr.failure_reason
      FROM merchant_payout_cycles c
      LEFT JOIN merchant_payout_summaries s ON s.id = c.summary_id
      LEFT JOIN merchant_payout_requests pr ON pr.id = c.payout_request_id
      WHERE c.wallet_id = ${walletId}
      ORDER BY
        CASE WHEN c.status = 'OPEN' THEN 0 ELSE 1 END,
        c.period_start DESC
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
    `;

    const out: MerchantPayoutCycleDto[] = [];
    for (const row of rows) {
      const status = String(row.status) as "OPEN" | "CLOSED";
      let settlement: MerchantPayoutSettlementSummary | null = null;
      if (status === "CLOSED" && row.net_order_value != null) {
        settlement = summaryFromLockedSnapshot(row as Record<string, unknown>);
      } else if (status === "OPEN") {
        const start = new Date(row.period_start as string);
        settlement = await computeLiveSettlement(walletId, start, new Date(), storeId);
      }

      const orderCount = settlement
        ? settlement.order_count
        : n(row.delivered_orders) + n(row.rejected_orders);

      const closeReason = row.close_reason != null ? String(row.close_reason) : null;
      const closedAsReturn =
        closeReason === "WITHDRAWAL_REJECTED" || closeReason === "WITHDRAWAL_FAILED";
      // The money returned *for this cycle* is the withdrawal that closed it. The ledger
      // window sum can hold a neighbouring cycle's reversal too, so it is not per-cycle.
      const withdrawalReturned = roundMoney(
        closedAsReturn && n(row.request_amount) > 0
          ? n(row.request_amount)
          : status === "CLOSED"
            ? n(row.withdrawal_reversal_credits)
            : n(settlement?.withdrawal_reversal_credits),
      );
      const closeNote =
        row.rejection_reason != null && String(row.rejection_reason).trim() !== ""
          ? String(row.rejection_reason).trim()
          : row.failure_reason != null && String(row.failure_reason).trim() !== ""
            ? String(row.failure_reason).trim()
            : null;

      out.push({
        id: Number(row.id),
        status,
        close_reason: closeReason,
        period_start: new Date(row.period_start as string).toISOString(),
        period_end: row.period_end
          ? new Date(row.period_end as string).toISOString()
          : null,
        payout_request_id:
          row.payout_request_id != null ? Number(row.payout_request_id) : null,
        net_payout: roundMoney(
          status === "CLOSED"
            ? n(row.net_payout)
            : n(settlement?.estimated_payout),
        ),
        estimated_payout: roundMoney(n(settlement?.estimated_payout ?? row.estimated_payout)),
        order_count: orderCount,
        withdrawal_returned: withdrawalReturned,
        withdrawal_amount: roundMoney(n(row.request_amount)),
        close_note: closeNote,
        settlement,
      });
    }
    return out;
  } catch {
    // Pre-migration fallback: empty list (UI may still use ledger cards)
    return [];
  }
}
