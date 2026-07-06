/**
 * Merchant payout settlement — partnersite DB aggregation layer.
 * Pure A−B−C formula lives in @gatimitra/merchant-payout (shared by backend + partnersite).
 */
import type { LedgerEntry } from "@/lib/wallet-types";
import { roundMoney } from "@/lib/wallet-types";
import { client as sql } from "@/lib/drizzle";
import {
  buildSummaryFromParts,
  computeSettlementFromLedgerEntries,
  type MerchantPayoutSettlementSummary,
} from "@gatimitra/merchant-payout";

export type { MerchantPayoutSettlementSummary };
export { computeSettlementFromLedgerEntries };

const SETTLEMENT_LEDGER_LIMIT = 5000;

async function resolveWalletId(merchantStoreId: number): Promise<number | null> {
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM merchant_wallet WHERE merchant_store_id = ${merchantStoreId} LIMIT 1
  `;
  const id = rows[0]?.id;
  return id != null ? Number(id) : null;
}

async function queryLedgerForSettlement(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ entries: LedgerEntry[] }> {
  const rows = await sql<
    {
      id: number;
      direction: string;
      category: string;
      balance_type: string;
      amount: string | number;
      balance_before: string | number | null;
      balance_after: string | number;
      reference_type: string;
      reference_id: number | null;
      reference_extra: string | null;
      description: string | null;
      metadata: Record<string, unknown> | null;
      status: string | null;
      order_id: number | null;
      gst_amount: string | number | null;
      commission_amount: string | number | null;
      tds_amount: string | number | null;
      created_at: string;
    }[]
  >`
    SELECT
      id, direction, category, balance_type, amount, balance_before, balance_after,
      reference_type, reference_id, reference_extra, description, metadata, status,
      order_id, gst_amount, commission_amount, tds_amount, created_at
    FROM merchant_wallet_ledger
    WHERE wallet_id = ${walletId}
      AND created_at >= ${periodStart.toISOString()}::timestamptz
      AND created_at <= ${periodEnd.toISOString()}::timestamptz
    ORDER BY created_at DESC
    LIMIT ${SETTLEMENT_LEDGER_LIMIT}
  `;

  return {
    entries: rows.map((row) => ({
      id: Number(row.id),
      direction: row.direction as "CREDIT" | "DEBIT",
      category: row.category,
      balance_type: row.balance_type,
      amount: Number(row.amount),
      balance_before: row.balance_before != null ? Number(row.balance_before) : null,
      balance_after: Number(row.balance_after),
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      reference_extra: row.reference_extra,
      description: row.description,
      metadata: row.metadata,
      status: row.status ?? "COMPLETED",
      order_id: row.order_id,
      gst_amount: row.gst_amount != null ? Number(row.gst_amount) : null,
      commission_amount: row.commission_amount != null ? Number(row.commission_amount) : null,
      tds_amount: row.tds_amount != null ? Number(row.tds_amount) : null,
      created_at: row.created_at,
    })),
  };
}

type OrderAggRow = {
  order_count: number;
  rejected_order_count: number;
  item_subtotal: number;
  packaging_charges: number;
  rejected_item_subtotal: number;
  rejected_packaging_charges: number;
  merchant_net_total: number;
  coupon_offer_discount: number;
  percentage_flat_offer_discount: number;
  combo_offer_discount: number;
  free_delivery_offer_discount: number;
  mechanism_fee: number;
  customer_compensation: number;
  cancellation_compensation: number;
};

type ExtraCompRow = { extra_compensation: number };

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

async function aggregateSettlementFromBreakdown(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<OrderAggRow | null> {
  try {
    const [row] = (await sql`
      WITH period_orders AS (
        SELECT DISTINCT ON (l.reference_id)
          l.reference_id AS orders_food_id,
          l.amount AS ledger_amount,
          l.commission_amount AS ledger_commission,
          l.category AS ledger_category,
          l.direction AS ledger_direction,
          f.order_id
        FROM merchant_wallet_ledger l
        LEFT JOIN public.orders_food f ON f.id = l.reference_id
        WHERE l.wallet_id = ${walletId}
          AND l.reference_id IS NOT NULL
          AND l.created_at >= ${periodStart.toISOString()}::timestamptz
          AND l.created_at <= ${periodEnd.toISOString()}::timestamptz
          AND (
            (l.direction = 'CREDIT' AND l.category = 'ORDER_EARNING')
            OR (
              l.category = 'ORDER_ADJUSTMENT'
              AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
              AND (
                (l.direction = 'CREDIT' AND COALESCE(l.metadata->>'balance_impact', '') = 'credit')
                OR (l.direction = 'DEBIT' AND COALESCE(l.metadata->>'balance_impact', '') = 'none')
              )
            )
          )
        ORDER BY
          l.reference_id,
          CASE WHEN l.category = 'ORDER_EARNING' THEN 0 ELSE 1 END,
          l.created_at DESC
      )
      SELECT
        COUNT(*)::int AS order_count,
        COUNT(*) FILTER (
          WHERE UPPER(COALESCE(osb.fulfillment_status, 'DELIVERED')) IN ('REJECTED', 'CANCELLED', 'RTO')
        )::int AS rejected_order_count,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(osb.item_total, 0) > 0 THEN osb.item_total
            WHEN COALESCE(oc.item_total, 0) > 0 THEN oc.item_total
            WHEN COALESCE(oc.total_ctm, 0) > 0 THEN GREATEST(0, oc.total_ctm - COALESCE(osb.packaging_charge, 0))
            ELSE GREATEST(0, po.ledger_amount - COALESCE(osb.packaging_charge, 0))
          END
        ), 0) AS item_subtotal,
        COALESCE(SUM(COALESCE(osb.packaging_charge, 0)), 0) AS packaging_charges,
        COALESCE(SUM(
          CASE
            WHEN UPPER(COALESCE(osb.fulfillment_status, 'DELIVERED')) IN ('REJECTED', 'CANCELLED', 'RTO')
            THEN
              CASE
                WHEN COALESCE(osb.item_total, 0) > 0 THEN osb.item_total
                WHEN COALESCE(oc.item_total, 0) > 0 THEN oc.item_total
                WHEN COALESCE(oc.total_ctm, 0) > 0 THEN GREATEST(0, oc.total_ctm - COALESCE(osb.packaging_charge, 0))
                ELSE GREATEST(0, po.ledger_amount - COALESCE(osb.packaging_charge, 0))
              END
            ELSE 0
          END
        ), 0) AS rejected_item_subtotal,
        COALESCE(SUM(
          CASE
            WHEN UPPER(COALESCE(osb.fulfillment_status, 'DELIVERED')) IN ('REJECTED', 'CANCELLED', 'RTO')
            THEN COALESCE(osb.packaging_charge, 0)
            ELSE 0
          END
        ), 0) AS rejected_packaging_charges,
        COALESCE(SUM(
          CASE
            WHEN po.ledger_category = 'ORDER_EARNING' AND po.ledger_direction = 'CREDIT' THEN po.ledger_amount
            ELSE 0
          END
        ), 0) AS merchant_net_total,
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
            osb.delivery_fee,
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
        COALESCE(SUM(
          GREATEST(
            COALESCE(NULLIF(osb.customer_compensation, 0), 0),
            COALESCE(NULLIF(osb.cancellation_refund, 0), 0)
          )
        ), 0) AS customer_compensation,
        COALESCE(SUM(
          CASE
            WHEN UPPER(COALESCE(osb.fulfillment_status, 'DELIVERED')) IN ('REJECTED', 'CANCELLED', 'RTO')
            THEN COALESCE(osb.cancellation_compensation, 0)
            ELSE 0
          END
        ), 0) AS cancellation_compensation
      FROM period_orders po
      LEFT JOIN public.order_settlement_breakdown osb ON osb.order_id = po.order_id
      LEFT JOIN public.orders_core oc ON oc.id = po.order_id
    `) as OrderAggRow[];
    return row ?? null;
  } catch {
    return null;
  }
}

async function sumExtraCompensationDebits(
  walletId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  try {
    const [row] = (await sql`
      SELECT COALESCE(SUM(l.amount), 0) AS extra_compensation
      FROM merchant_wallet_ledger l
      WHERE l.wallet_id = ${walletId}
        AND l.direction = 'DEBIT'
        AND l.created_at >= ${periodStart.toISOString()}::timestamptz
        AND l.created_at <= ${periodEnd.toISOString()}::timestamptz
        AND (
          (
            COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
            AND COALESCE(l.metadata->>'balance_impact', '') = 'debit'
          )
          OR l.category = 'REFUND_DEBIT'
          OR l.category = 'REFUND_TO_CUSTOMER'
          OR (
            l.category = 'ORDER_ADJUSTMENT'
            AND COALESCE(l.metadata->>'balance_impact', '') = 'debit'
            AND (
              COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
              OR COALESCE(l.description, '') ILIKE '%cancel%'
            )
          )
          OR (
            l.category = 'PENALTY'
            AND (
              COALESCE(l.metadata->>'type', '') ILIKE '%compensation%'
              OR COALESCE(l.description, '') ILIKE '%compensation%'
            )
          )
        )
    `) as ExtraCompRow[];
    return n(row?.extra_compensation);
  } catch {
    return 0;
  }
}

export async function getPayoutSettlement(
  merchantStoreId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<MerchantPayoutSettlementSummary> {
  const walletId = await resolveWalletId(merchantStoreId);
  if (!walletId) {
    return buildSummaryFromParts({
      itemSubtotal: 0,
      packagingCharges: 0,
      couponOfferDiscount: 0,
      percentageFlatOfferDiscount: 0,
      comboOfferDiscount: 0,
      freeDeliveryOfferDiscount: 0,
      mechanismFee: 0,
      customerCompensation: 0,
      deliveredOrderCount: 0,
      rejectedOrderCount: 0,
    });
  }

  const [breakdown, extraCompensation] = await Promise.all([
    aggregateSettlementFromBreakdown(walletId, periodStart, periodEnd),
    sumExtraCompensationDebits(walletId, periodStart, periodEnd),
  ]);

  if (breakdown && breakdown.order_count > 0) {
    const rejected = n(breakdown.rejected_order_count);
    const orderCount = n(breakdown.order_count);
    const delivered = Math.max(0, orderCount - rejected);

    const customerCompensation = roundMoney(extraCompensation);

    return buildSummaryFromParts({
      itemSubtotal: n(breakdown.item_subtotal),
      packagingCharges: n(breakdown.packaging_charges),
      couponOfferDiscount: n(breakdown.coupon_offer_discount),
      percentageFlatOfferDiscount: n(breakdown.percentage_flat_offer_discount),
      comboOfferDiscount: n(breakdown.combo_offer_discount),
      freeDeliveryOfferDiscount: n(breakdown.free_delivery_offer_discount),
      mechanismFee: n(breakdown.mechanism_fee),
      customerCompensation,
      deliveredOrderCount: delivered,
      rejectedOrderCount: rejected,
      rejectedItemSubtotal: n(breakdown.rejected_item_subtotal),
      rejectedPackagingCharges: n(breakdown.rejected_packaging_charges),
      cancellationCompensation: n(breakdown.cancellation_compensation),
      merchantNetTotal: n(breakdown.merchant_net_total),
    });
  }

  const { entries } = await queryLedgerForSettlement(walletId, periodStart, periodEnd);
  return computeSettlementFromLedgerEntries(entries);
}
