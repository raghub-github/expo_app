/**
 * Merchant payout settlement summary (A − B − C).
 * Single source of truth for merchant app payout detail Summary tab.
 */
import type { LedgerEntry } from "@/lib/wallet-types";
import { roundMoney } from "@/lib/wallet-types";
import { client as sql } from "@/lib/drizzle";

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

export type MerchantPayoutSettlementSummary = {
  net_order_value: number;
  item_subtotal: number;
  packaging_charges: number;
  restaurant_discounts: number;
  coupon_offer_discount: number;
  percentage_flat_offer_discount: number;
  combo_offer_discount: number;
  free_delivery_offer_discount: number;
  order_deductions: number;
  mechanism_fee: number;
  customer_compensation: number;
  estimated_payout: number;
  order_count: number;
  delivered_order_count: number;
  rejected_order_count: number;
};

type OrderAggRow = {
  order_count: number;
  rejected_order_count: number;
  item_subtotal: number;
  packaging_charges: number;
  coupon_offer_discount: number;
  percentage_flat_offer_discount: number;
  combo_offer_discount: number;
  free_delivery_offer_discount: number;
  mechanism_fee: number;
  customer_compensation: number;
};

type ExtraCompRow = { extra_compensation: number };

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function ledgerMetaNumber(meta: Record<string, unknown> | null | undefined, keys: string[]): number {
  if (!meta) return 0;
  for (const key of keys) {
    const v = meta[key];
    const num = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function isCancellationStoreDebit(entry: LedgerEntry): boolean {
  if (entry.direction !== "DEBIT") return false;
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const entryType = String(meta?.entry_type ?? "").toLowerCase();
  const balanceImpact = String(meta?.balance_impact ?? "").toLowerCase();
  const desc = (entry.description ?? "").toLowerCase();

  if (entryType === "order_cancellation" && balanceImpact === "debit") return true;

  if (
    entry.category === "ORDER_ADJUSTMENT" &&
    balanceImpact === "debit" &&
    (entryType === "order_cancellation" || desc.includes("cancel"))
  ) {
    return true;
  }

  if (entry.category === "REFUND_DEBIT" || entry.category === "REFUND_TO_CUSTOMER") {
    return entryType.includes("cancel") || desc.includes("cancel");
  }

  return false;
}

function sumCustomerCompensationFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const fromMeta = ledgerMetaNumber(meta, [
      "customer_compensation",
      "cancellation_refund",
      "cancellation_refund_amount",
      "merchant_compensation",
      "compensation_amount",
      "compensation",
    ]);
    if (fromMeta > 0) {
      sum += fromMeta;
      continue;
    }
    if (isCancellationStoreDebit(entry)) {
      sum += n(entry.amount);
      continue;
    }
    if (entry.direction !== "DEBIT") continue;
    const type = String(meta?.type ?? meta?.entry_type ?? "").toLowerCase();
    const desc = (entry.description ?? "").toLowerCase();
    if (
      entry.category === "PENALTY" &&
      (type.includes("compensation") || desc.includes("compensation"))
    ) {
      sum += n(entry.amount);
    }
  }
  return sum;
}

function sumMechanismFeeFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const fromMeta = ledgerMetaNumber(meta, [
      "payment_mechanism_fee",
      "mechanism_fee",
      "pg_fee",
      "payment_mechanism",
    ]);
    if (fromMeta > 0) {
      sum += fromMeta;
      continue;
    }
    if (entry.category === "ORDER_EARNING" && entry.direction === "CREDIT") {
      sum += n(entry.commission_amount);
    } else if (entry.category === "COMMISSION_DEDUCTION" && entry.direction === "DEBIT") {
      sum += n(entry.amount);
    }
  }
  return sum;
}

function buildSummaryFromParts(parts: {
  itemSubtotal: number;
  packagingCharges: number;
  couponOfferDiscount: number;
  percentageFlatOfferDiscount: number;
  comboOfferDiscount: number;
  freeDeliveryOfferDiscount: number;
  mechanismFee: number;
  customerCompensation: number;
  deliveredOrderCount: number;
  rejectedOrderCount: number;
}): MerchantPayoutSettlementSummary {
  const itemSubtotal = roundMoney(parts.itemSubtotal);
  const packagingCharges = roundMoney(parts.packagingCharges);
  const netOrderValue = roundMoney(itemSubtotal + packagingCharges);

  const couponOfferDiscount = roundMoney(parts.couponOfferDiscount);
  const percentageFlatOfferDiscount = roundMoney(parts.percentageFlatOfferDiscount);
  const comboOfferDiscount = roundMoney(parts.comboOfferDiscount);
  const freeDeliveryOfferDiscount = roundMoney(parts.freeDeliveryOfferDiscount);
  const restaurantDiscounts = roundMoney(
    couponOfferDiscount +
      percentageFlatOfferDiscount +
      comboOfferDiscount +
      freeDeliveryOfferDiscount,
  );

  const mechanismFee = roundMoney(parts.mechanismFee);
  const customerCompensation = roundMoney(parts.customerCompensation);
  const orderDeductions = roundMoney(mechanismFee + customerCompensation);
  const estimatedPayout = roundMoney(netOrderValue - restaurantDiscounts - orderDeductions);

  const deliveredOrderCount = parts.deliveredOrderCount;
  const rejectedOrderCount = parts.rejectedOrderCount;
  const orderCount = deliveredOrderCount + rejectedOrderCount;

  return {
    net_order_value: netOrderValue,
    item_subtotal: itemSubtotal,
    packaging_charges: packagingCharges,
    restaurant_discounts: restaurantDiscounts,
    coupon_offer_discount: couponOfferDiscount,
    percentage_flat_offer_discount: percentageFlatOfferDiscount,
    combo_offer_discount: comboOfferDiscount,
    free_delivery_offer_discount: freeDeliveryOfferDiscount,
    order_deductions: orderDeductions,
    mechanism_fee: mechanismFee,
    customer_compensation: customerCompensation,
    estimated_payout: estimatedPayout,
    order_count: orderCount,
    delivered_order_count: deliveredOrderCount,
    rejected_order_count: rejectedOrderCount,
  };
}

/** Aggregate settlement from order_settlement_breakdown for orders credited in the period. */
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
          f.order_id
        FROM merchant_wallet_ledger l
        LEFT JOIN public.orders_food f ON f.id = l.reference_id
        WHERE l.wallet_id = ${walletId}
          AND l.category = 'ORDER_EARNING'
          AND l.direction = 'CREDIT'
          AND l.reference_id IS NOT NULL
          AND l.created_at >= ${periodStart.toISOString()}::timestamptz
          AND l.created_at <= ${periodEnd.toISOString()}::timestamptz
        ORDER BY l.reference_id, l.created_at DESC
      )
      SELECT
        COUNT(*)::int AS order_count,
        COUNT(*) FILTER (
          WHERE UPPER(COALESCE(osb.fulfillment_status, 'DELIVERED')) IN ('REJECTED', 'CANCELLED', 'RTO')
        )::int AS rejected_order_count,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(osb.item_total, 0) > 0 THEN osb.item_total
            ELSE GREATEST(0, po.ledger_amount - COALESCE(osb.packaging_charge, 0))
          END
        ), 0) AS item_subtotal,
        COALESCE(SUM(COALESCE(osb.packaging_charge, 0)), 0) AS packaging_charges,
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
        ), 0) AS customer_compensation
      FROM period_orders po
      LEFT JOIN public.order_settlement_breakdown osb ON osb.order_id = po.order_id
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

/** Ledger-only fallback when breakdown rows are missing. */
export function computeSettlementFromLedgerEntries(
  entries: LedgerEntry[],
): MerchantPayoutSettlementSummary {
  const orderCredits = entries.filter(
    (e) => e.category === "ORDER_EARNING" && e.direction === "CREDIT",
  );

  let itemSubtotal = 0;
  let packagingCharges = 0;
  let couponOfferDiscount = 0;
  let percentageFlatOfferDiscount = 0;
  let comboOfferDiscount = 0;
  let freeDeliveryOfferDiscount = 0;

  for (const entry of orderCredits) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const gross = ledgerMetaNumber(meta, ["merchant_gross", "order_gross", "gross_revenue"]);
    const net = n(entry.amount);
    const commission = n(entry.commission_amount);
    const gst = n(entry.gst_amount);
    const tds = n(entry.tds_amount);
    const orderGross = gross > 0 ? gross : net + commission + gst + tds;

    const packaging = ledgerMetaNumber(meta, ["packaging_charge", "packaging_charges", "packaging"]);
    const item = ledgerMetaNumber(meta, ["item_subtotal", "item_total", "items_total", "subtotal"]);

    packagingCharges += packaging > 0 ? packaging : 0;
    itemSubtotal += item > 0 ? item : Math.max(0, orderGross - packaging);
  }

  if (itemSubtotal <= 0 && packagingCharges <= 0 && orderCredits.length > 0) {
    itemSubtotal = orderCredits.reduce((s, e) => s + n(e.amount), 0);
  }

  for (const entry of orderCredits) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    couponOfferDiscount += ledgerMetaNumber(meta, [
      "coupon_offer_discount",
      "coupon_discount",
      "promo_discount",
      "restaurant_discount_promo",
      "merchant_promo_discount",
    ]);
    percentageFlatOfferDiscount += ledgerMetaNumber(meta, [
      "percentage_flat_offer_discount",
      "cart_offer_discount",
      "percentage_discount",
      "flat_discount",
      "restaurant_discount_other",
      "flat_off_discount",
      "merchant_funded_discount",
      "restaurant_discount",
    ]);
    comboOfferDiscount += ledgerMetaNumber(meta, [
      "combo_offer_discount",
      "bogo_discount",
      "bundle_discount",
      "free_item_discount",
      "freebie_discount",
    ]);
    freeDeliveryOfferDiscount += ledgerMetaNumber(meta, [
      "free_delivery_offer_discount",
      "delivery_charge_discount",
      "delivery_discount",
      "merchant_delivery_discount",
    ]);
  }

  let deliveredOrderCount = 0;
  let rejectedOrderCount = 0;
  const seenOrders = new Set<string>();
  for (const entry of entries) {
    if (entry.category !== "ORDER_EARNING" && entry.category !== "ORDER_ADJUSTMENT") continue;
    const key = String(entry.reference_id ?? entry.order_id ?? entry.id);
    if (seenOrders.has(key)) continue;
    seenOrders.add(key);
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const status = String(meta?.order_status ?? meta?.fulfillment_status ?? "").toUpperCase();
    if (
      status === "REJECTED" ||
      status === "CANCELLED" ||
      status === "RTO" ||
      meta?.entry_type === "order_cancellation"
    ) {
      rejectedOrderCount += 1;
    } else {
      deliveredOrderCount += 1;
    }
  }

  const mechanismFee = sumMechanismFeeFromLedger(entries);
  const customerCompensation = sumCustomerCompensationFromLedger(entries);

  return buildSummaryFromParts({
    itemSubtotal,
    packagingCharges,
    couponOfferDiscount,
    percentageFlatOfferDiscount,
    comboOfferDiscount,
    freeDeliveryOfferDiscount,
    mechanismFee,
    customerCompensation,
    deliveredOrderCount,
    rejectedOrderCount,
  });
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

    const osbCompensation = n(breakdown.customer_compensation);
    const customerCompensation = roundMoney(osbCompensation + extraCompensation);

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
    });
  }

  const { entries } = await queryLedgerForSettlement(walletId, periodStart, periodEnd);
  const ledgerSummary = computeSettlementFromLedgerEntries(entries);

  if (extraCompensation > 0) {
    const customerCompensation = roundMoney(ledgerSummary.customer_compensation + extraCompensation);
    const orderDeductions = roundMoney(ledgerSummary.mechanism_fee + customerCompensation);
    const estimatedPayout = roundMoney(ledgerSummary.net_order_value - ledgerSummary.restaurant_discounts - orderDeductions);
    return {
      ...ledgerSummary,
      customer_compensation: customerCompensation,
      order_deductions: orderDeductions,
      estimated_payout: estimatedPayout,
    };
  }

  return ledgerSummary;
}
