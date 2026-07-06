import type { LedgerEntry } from "@gatimitra/contracts";
import { roundMoney } from "@gatimitra/contracts";
import type {
  MerchantPayoutSettlementClient,
  MerchantPayoutSettlementSummary,
  SettlementPartsInput,
} from "./types.js";

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

export function isCancellationStoreDebit(entry: LedgerEntry): boolean {
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

export function sumCustomerCompensationFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    if (entry.direction !== "DEBIT") continue;
    if (isCancellationStoreDebit(entry)) {
      sum += n(entry.amount);
      continue;
    }
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
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

export function sumMechanismFeeFromLedger(entries: LedgerEntry[]): number {
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

function ledgerOrderGrossParts(
  meta: Record<string, unknown> | null | undefined,
  entryAmount?: number,
): { item: number; packaging: number } {
  const packaging = ledgerMetaNumber(meta, ["packaging_charge", "packaging_charges", "packaging"]);
  let item = ledgerMetaNumber(meta, ["item_subtotal", "item_total", "items_total", "subtotal"]);
  const netOrder = ledgerMetaNumber(meta, ["net_order_value", "total_ctm", "merchant_ctm", "merchant_gross"]);
  if (item <= 0 && netOrder > 0) {
    item = Math.max(0, netOrder - packaging);
  }
  if (item <= 0 && packaging <= 0 && entryAmount != null && entryAmount > 0) {
    item = entryAmount;
  }
  return { item, packaging };
}

function isRejectedCancellationEntry(entry: LedgerEntry): boolean {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const status = String(meta?.order_status ?? meta?.fulfillment_status ?? "").toUpperCase();
  return (
    meta?.entry_type === "order_cancellation" ||
    status === "REJECTED" ||
    status === "CANCELLED" ||
    status === "RTO"
  );
}

/**
 * Core A − B − C payout formula.
 * payoutBase = merchantNetTotal (when credits exist) else delivered gross.
 * estimated_payout = max(0, payoutBase − restaurantDiscounts − customerCompensation + cancellationCompensation)
 */
export function buildSummaryFromParts(parts: SettlementPartsInput): MerchantPayoutSettlementSummary {
  const itemSubtotal = roundMoney(parts.itemSubtotal);
  const packagingCharges = roundMoney(parts.packagingCharges);

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

  const rejectedItemSubtotal = roundMoney(parts.rejectedItemSubtotal ?? 0);
  const rejectedPackagingCharges = roundMoney(parts.rejectedPackagingCharges ?? 0);
  const deliveredItemSubtotal = roundMoney(Math.max(0, itemSubtotal - rejectedItemSubtotal));
  const deliveredPackagingCharges = roundMoney(Math.max(0, packagingCharges - rejectedPackagingCharges));
  const deliveredGross = roundMoney(deliveredItemSubtotal + deliveredPackagingCharges);
  const netOrderValue = deliveredGross;
  const cancellationCompensation = roundMoney(parts.cancellationCompensation ?? 0);
  const merchantNetTotal = roundMoney(parts.merchantNetTotal ?? 0);
  const payoutBase = merchantNetTotal > 0 ? merchantNetTotal : deliveredGross;
  const estimatedPayout = roundMoney(
    Math.max(
      0,
      payoutBase - restaurantDiscounts - customerCompensation + cancellationCompensation,
    ),
  );

  const deliveredOrderCount = parts.deliveredOrderCount;
  const rejectedOrderCount = parts.rejectedOrderCount;
  const orderCount = deliveredOrderCount + rejectedOrderCount;

  return {
    net_order_value: netOrderValue,
    item_subtotal: deliveredItemSubtotal,
    packaging_charges: deliveredPackagingCharges,
    restaurant_discounts: restaurantDiscounts,
    coupon_offer_discount: couponOfferDiscount,
    percentage_flat_offer_discount: percentageFlatOfferDiscount,
    combo_offer_discount: comboOfferDiscount,
    free_delivery_offer_discount: freeDeliveryOfferDiscount,
    order_deductions: orderDeductions,
    mechanism_fee: mechanismFee,
    customer_compensation: customerCompensation,
    cancellation_compensation: cancellationCompensation,
    estimated_payout: estimatedPayout,
    order_count: orderCount,
    delivered_order_count: deliveredOrderCount,
    rejected_order_count: rejectedOrderCount,
  };
}

/** Ledger-only fallback when order_settlement_breakdown rows are missing. */
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

  const creditedOrderKeys = new Set(
    orderCredits.map((e) => String(e.reference_id ?? e.order_id ?? e.id)),
  );
  const cancelDisplayKeys = new Set<string>();
  for (const entry of entries) {
    if (!isRejectedCancellationEntry(entry)) continue;
    const key = String(entry.reference_id ?? entry.order_id ?? entry.id);
    if (cancelDisplayKeys.has(key) || creditedOrderKeys.has(key)) continue;
    cancelDisplayKeys.add(key);
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const { item, packaging } = ledgerOrderGrossParts(meta, n(entry.amount));
    if (item > 0) itemSubtotal += item;
    if (packaging > 0) packagingCharges += packaging;
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
  const merchantNetTotal = roundMoney(
    orderCredits.reduce((s, e) => s + n(e.amount), 0),
  );

  let rejectedItemSubtotal = 0;
  let rejectedPackagingCharges = 0;
  let cancellationCompensation = 0;
  const rejectedKeys = new Set<string>();

  for (const entry of entries) {
    if (!isRejectedCancellationEntry(entry)) continue;

    const key = String(entry.reference_id ?? entry.order_id ?? entry.id);
    if (rejectedKeys.has(key)) continue;
    rejectedKeys.add(key);

    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const { item, packaging } = ledgerOrderGrossParts(meta, n(entry.amount));
    rejectedItemSubtotal += item;
    rejectedPackagingCharges += packaging;

    const keeps = ledgerMetaNumber(meta, ["merchant_keeps_amount", "cancellation_compensation"]);
    if (keeps > 0) {
      cancellationCompensation += keeps;
    } else if (
      entry.category === "ORDER_ADJUSTMENT" &&
      entry.direction === "CREDIT" &&
      meta?.entry_type === "order_cancellation" &&
      String(meta?.balance_impact ?? "").toLowerCase() === "credit"
    ) {
      cancellationCompensation += n(entry.amount);
    }
  }

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
    rejectedItemSubtotal,
    rejectedPackagingCharges,
    cancellationCompensation,
    merchantNetTotal,
  });
}

export function mapSettlementToClient(
  summary: MerchantPayoutSettlementSummary,
): MerchantPayoutSettlementClient {
  return {
    netOrderValue: summary.net_order_value,
    itemSubtotal: summary.item_subtotal,
    packagingCharges: summary.packaging_charges,
    restaurantDiscounts: summary.restaurant_discounts,
    couponOfferDiscount: summary.coupon_offer_discount,
    percentageFlatOfferDiscount: summary.percentage_flat_offer_discount,
    comboOfferDiscount: summary.combo_offer_discount,
    freeDeliveryOfferDiscount: summary.free_delivery_offer_discount,
    orderDeductions: summary.order_deductions,
    mechanismFee: summary.mechanism_fee,
    customerCompensation: summary.customer_compensation,
    cancellationCompensation: summary.cancellation_compensation,
    estimatedPayout: summary.estimated_payout,
    orderCount: summary.order_count,
    deliveredOrderCount: summary.delivered_order_count,
    rejectedOrderCount: summary.rejected_order_count,
  };
}

export function mapSettlementApiResponse(
  raw: Record<string, unknown>,
): MerchantPayoutSettlementClient {
  return mapSettlementToClient({
    net_order_value: n(raw.net_order_value),
    item_subtotal: n(raw.item_subtotal),
    packaging_charges: n(raw.packaging_charges),
    restaurant_discounts: n(raw.restaurant_discounts),
    coupon_offer_discount: n(raw.coupon_offer_discount),
    percentage_flat_offer_discount: n(raw.percentage_flat_offer_discount),
    combo_offer_discount: n(raw.combo_offer_discount),
    free_delivery_offer_discount: n(raw.free_delivery_offer_discount),
    order_deductions: n(raw.order_deductions),
    mechanism_fee: n(raw.mechanism_fee),
    customer_compensation: n(raw.customer_compensation),
    cancellation_compensation: n(raw.cancellation_compensation),
    estimated_payout: n(raw.estimated_payout),
    order_count: n(raw.order_count),
    delivered_order_count: n(raw.delivered_order_count),
    rejected_order_count: n(raw.rejected_order_count),
  });
}
