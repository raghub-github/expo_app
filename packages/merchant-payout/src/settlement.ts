import type { LedgerEntry } from "@gatimitra/contracts";
import { roundMoney } from "@gatimitra/contracts";
import type {
  MerchantPayoutSettlementClient,
  MerchantPayoutSettlementSummary,
  OrderDeductionLine,
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

/** @deprecated Use sumRefundAdjustmentsFromLedger — kept for callers. */
export function sumCustomerCompensationFromLedger(entries: LedgerEntry[]): number {
  return sumRefundAdjustmentsFromLedger(entries);
}

export function sumRefundAdjustmentsFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    if (entry.direction !== "DEBIT") continue;
    if (entry.category === "REFUND_DEBIT" || entry.category === "REFUND_TO_CUSTOMER") {
      sum += n(entry.amount);
      continue;
    }
    if (isCancellationStoreDebit(entry)) {
      sum += n(entry.amount);
    }
  }
  return sum;
}

export function sumPenaltiesFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    if (entry.direction !== "DEBIT") continue;
    if (entry.category !== "PENALTY") continue;
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    if (meta?.pending === true || meta?.pending === "true" || meta?.pending === 1) continue;
    const status = String(meta?.status ?? "").toLowerCase();
    if (status.includes("pending") || status.includes("warning")) continue;
    if (meta?.finalized === false || meta?.finalized === "false" || meta?.finalized === 0) continue;
    sum += n(entry.amount);
  }
  return sum;
}

export function sumManualDebitsFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    if (entry.direction !== "DEBIT") continue;
    if (entry.category === "MANUAL_DEBIT" || entry.category === "ADJUSTMENT_DEBIT") {
      sum += n(entry.amount);
    }
  }
  return sum;
}

export function sumChargebacksFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  for (const entry of entries) {
    if (entry.direction !== "DEBIT") continue;
    const cat = String(entry.category ?? "").toUpperCase();
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const type = String(meta?.type ?? meta?.entry_type ?? "").toLowerCase();
    const desc = (entry.description ?? "").toLowerCase();
    if (cat.includes("CHARGEBACK") || type.includes("chargeback") || desc.includes("chargeback")) {
      sum += n(entry.amount);
    }
  }
  return sum;
}

export function sumOtherMerchantCreditsFromLedger(entries: LedgerEntry[]): number {
  const parts = sumOtherMerchantCreditPartsFromLedger(entries);
  return (
    parts.withdrawalReversalCredits +
    parts.manualCredits +
    parts.adjustmentCredits +
    parts.gstCredits +
    parts.penaltyReversalCredits
  );
}

export function sumOtherMerchantCreditPartsFromLedger(entries: LedgerEntry[]): {
  withdrawalReversalCredits: number;
  manualCredits: number;
  adjustmentCredits: number;
  gstCredits: number;
  penaltyReversalCredits: number;
} {
  let withdrawalReversalCredits = 0;
  let manualCredits = 0;
  let adjustmentCredits = 0;
  let gstCredits = 0;
  let penaltyReversalCredits = 0;
  for (const entry of entries) {
    if (entry.direction !== "CREDIT") continue;
    const cat = String(entry.category ?? "");
    const amt = n(entry.amount);
    if (cat === "FAILED_WITHDRAWAL_REVERSAL" || cat === "WITHDRAWAL_REVERSAL") {
      withdrawalReversalCredits += amt;
    } else if (cat === "MANUAL_CREDIT") {
      manualCredits += amt;
    } else if (cat === "ADJUSTMENT_CREDIT") {
      adjustmentCredits += amt;
    } else if (cat === "GST_CREDIT") {
      gstCredits += amt;
    } else if (cat === "PENALTY_REVERSAL") {
      penaltyReversalCredits += amt;
    }
  }
  return {
    withdrawalReversalCredits,
    manualCredits,
    adjustmentCredits,
    gstCredits,
    penaltyReversalCredits,
  };
}

export function sumCancellationCompensationFromLedger(entries: LedgerEntry[]): number {
  let sum = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.direction !== "CREDIT") continue;
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    const entryType = String(meta?.entry_type ?? "").toLowerCase();
    const balanceImpact = String(meta?.balance_impact ?? "").toLowerCase();
    const isCompCredit =
      entry.category === "ORDER_ADJUSTMENT" &&
      entryType === "order_cancellation" &&
      balanceImpact === "credit";
    if (!isCompCredit) continue;
    const key = String(entry.reference_id ?? entry.order_id ?? entry.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const keeps = ledgerMetaNumber(meta, ["merchant_keeps_amount", "cancellation_compensation"]);
    sum += keeps > 0 ? keeps : n(entry.amount);
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

/**
 * Ledger SSOT formula:
 * Est. payout = A (ORDER_EARNING credits) + cancellation compensation + other credits − C
 * Store offer discounts (B) are informational only — never subtracted from Est. payout.
 * Mechanism fee is informational when A is already post-fee net (default).
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
  const penalties = roundMoney(parts.penalties ?? 0);
  const refundAdjustments = roundMoney(
    parts.refundAdjustments ?? parts.customerCompensation ?? 0,
  );
  const manualDebitAdjustments = roundMoney(parts.manualDebitAdjustments ?? 0);
  const chargebacks = roundMoney(parts.chargebacks ?? 0);
  const includeMechanism = parts.includeMechanismFeeInDeductions === true;
  const orderDeductions = roundMoney(
    penalties +
      refundAdjustments +
      manualDebitAdjustments +
      chargebacks +
      (includeMechanism ? mechanismFee : 0),
  );

  const merchantNetTotal = roundMoney(parts.merchantNetTotal ?? 0);
  // A = wallet-credited earnings only (never delivered gross)
  const netOrderValue = merchantNetTotal;
  const cancellationCompensation = roundMoney(parts.cancellationCompensation ?? 0);
  const withdrawalReversalCredits = roundMoney(parts.withdrawalReversalCredits ?? 0);
  const manualCredits = roundMoney(parts.manualCredits ?? 0);
  const adjustmentCredits = roundMoney(parts.adjustmentCredits ?? 0);
  const gstCredits = roundMoney(parts.gstCredits ?? 0);
  const penaltyReversalCredits = roundMoney(parts.penaltyReversalCredits ?? 0);
  const otherCreditsFromParts = roundMoney(parts.otherCredits ?? 0);
  const otherCreditsBreakdown =
    withdrawalReversalCredits + manualCredits + adjustmentCredits + gstCredits + penaltyReversalCredits;
  const otherCredits = roundMoney(
    otherCreditsFromParts > 0 ? otherCreditsFromParts : otherCreditsBreakdown,
  );

  const estimatedPayout = roundMoney(
    Math.max(0, netOrderValue + cancellationCompensation + otherCredits - orderDeductions),
  );

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
    customer_compensation: refundAdjustments,
    cancellation_compensation: cancellationCompensation,
    other_credits: otherCredits,
    withdrawal_reversal_credits: withdrawalReversalCredits,
    manual_credits: manualCredits,
    adjustment_credits: adjustmentCredits,
    gst_credits: gstCredits,
    penalty_reversal_credits: penaltyReversalCredits,
    penalties,
    refund_adjustments: refundAdjustments,
    manual_debit_adjustments: manualDebitAdjustments,
    chargebacks,
    estimated_payout: estimatedPayout,
    order_count: orderCount,
    delivered_order_count: deliveredOrderCount,
    rejected_order_count: rejectedOrderCount,
  };
}

/** Non-zero deduction rows for Order level deductions (C). */
export function buildOrderDeductionLines(
  summary: MerchantPayoutSettlementSummary,
): OrderDeductionLine[] {
  const lines: OrderDeductionLine[] = [];
  if (summary.penalties > 0) {
    lines.push({ key: "penalties", label: "Penalties", amount: summary.penalties });
  }
  if (summary.refund_adjustments > 0) {
    lines.push({
      key: "refund_adjustments",
      label: "Refund adjustments",
      amount: summary.refund_adjustments,
    });
  }
  if (summary.manual_debit_adjustments > 0) {
    lines.push({
      key: "manual_debit_adjustments",
      label: "Manual debit adjustments",
      amount: summary.manual_debit_adjustments,
    });
  }
  if (summary.chargebacks > 0) {
    lines.push({ key: "chargebacks", label: "Chargebacks", amount: summary.chargebacks });
  }
  // Mechanism fee is informational (already in A when net); show only if counted in C
  if (summary.mechanism_fee > 0 && summary.order_deductions >= summary.mechanism_fee) {
    const withoutMech =
      summary.penalties +
      summary.refund_adjustments +
      summary.manual_debit_adjustments +
      summary.chargebacks;
    if (roundMoney(summary.order_deductions - withoutMech) > 0) {
      lines.push({
        key: "mechanism_fee",
        label: "Payment mechanism fee",
        amount: summary.mechanism_fee,
      });
    }
  }
  return lines;
}

/** Ledger-only settlement — ORDER_EARNING credits are the sole source for A. */
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
    const packaging = ledgerMetaNumber(meta, ["packaging_charge", "packaging_charges", "packaging"]);
    const item = ledgerMetaNumber(meta, ["item_subtotal", "item_total", "items_total", "subtotal"]);
    const gross = ledgerMetaNumber(meta, ["merchant_gross", "order_gross", "gross_revenue"]);
    const net = n(entry.amount);
    const commission = n(entry.commission_amount);
    const gst = n(entry.gst_amount);
    const tds = n(entry.tds_amount);
    const orderGross = gross > 0 ? gross : net + commission + gst + tds;

    packagingCharges += packaging > 0 ? packaging : 0;
    itemSubtotal += item > 0 ? item : Math.max(0, orderGross - packaging);

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

  if (itemSubtotal <= 0 && packagingCharges <= 0 && orderCredits.length > 0) {
    itemSubtotal = orderCredits.reduce((s, e) => s + n(e.amount), 0);
  }

  const merchantNetTotal = roundMoney(orderCredits.reduce((s, e) => s + n(e.amount), 0));
  const deliveredOrderCount = orderCredits.length;

  let rejectedOrderCount = 0;
  const seenReject = new Set<string>();
  for (const entry of entries) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
    if (meta?.entry_type !== "order_cancellation") continue;
    const key = String(entry.reference_id ?? entry.order_id ?? entry.id);
    if (seenReject.has(key)) continue;
    seenReject.add(key);
    rejectedOrderCount += 1;
  }

  const creditParts = sumOtherMerchantCreditPartsFromLedger(entries);
  return buildSummaryFromParts({
    itemSubtotal,
    packagingCharges,
    couponOfferDiscount,
    percentageFlatOfferDiscount,
    comboOfferDiscount,
    freeDeliveryOfferDiscount,
    mechanismFee: sumMechanismFeeFromLedger(entries),
    deliveredOrderCount,
    rejectedOrderCount,
    cancellationCompensation: sumCancellationCompensationFromLedger(entries),
    merchantNetTotal,
    otherCredits: sumOtherMerchantCreditsFromLedger(entries),
    withdrawalReversalCredits: creditParts.withdrawalReversalCredits,
    manualCredits: creditParts.manualCredits,
    adjustmentCredits: creditParts.adjustmentCredits,
    gstCredits: creditParts.gstCredits,
    penaltyReversalCredits: creditParts.penaltyReversalCredits,
    penalties: sumPenaltiesFromLedger(entries),
    refundAdjustments: sumRefundAdjustmentsFromLedger(entries),
    manualDebitAdjustments: sumManualDebitsFromLedger(entries),
    chargebacks: sumChargebacksFromLedger(entries),
    includeMechanismFeeInDeductions: false,
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
    otherCredits: summary.other_credits ?? 0,
    withdrawalReversalCredits: summary.withdrawal_reversal_credits ?? 0,
    manualCredits: summary.manual_credits ?? 0,
    adjustmentCredits: summary.adjustment_credits ?? 0,
    gstCredits: summary.gst_credits ?? 0,
    penaltyReversalCredits: summary.penalty_reversal_credits ?? 0,
    penalties: summary.penalties ?? 0,
    refundAdjustments: summary.refund_adjustments ?? 0,
    manualDebitAdjustments: summary.manual_debit_adjustments ?? 0,
    chargebacks: summary.chargebacks ?? 0,
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
    customer_compensation: n(raw.customer_compensation ?? raw.refund_adjustments),
    cancellation_compensation: n(raw.cancellation_compensation),
    other_credits: n(raw.other_credits),
    withdrawal_reversal_credits: n(raw.withdrawal_reversal_credits),
    manual_credits: n(raw.manual_credits),
    adjustment_credits: n(raw.adjustment_credits),
    gst_credits: n(raw.gst_credits),
    penalty_reversal_credits: n(raw.penalty_reversal_credits),
    penalties: n(raw.penalties),
    refund_adjustments: n(raw.refund_adjustments ?? raw.customer_compensation),
    manual_debit_adjustments: n(raw.manual_debit_adjustments),
    chargebacks: n(raw.chargebacks),
    estimated_payout: n(raw.estimated_payout),
    order_count: n(raw.order_count),
    delivered_order_count: n(raw.delivered_order_count),
    rejected_order_count: n(raw.rejected_order_count),
  });
}

export function summaryFromLockedSnapshot(row: Record<string, unknown>): MerchantPayoutSettlementSummary {
  return {
    net_order_value: n(row.net_order_value),
    item_subtotal: n(row.item_subtotal),
    packaging_charges: n(row.packaging_charges),
    restaurant_discounts: n(row.restaurant_discounts),
    coupon_offer_discount: n(row.coupon_offer_discount ?? row.promo_discount),
    percentage_flat_offer_discount: n(
      row.percentage_flat_offer_discount ?? row.other_restaurant_discount,
    ),
    combo_offer_discount: n(row.combo_offer_discount),
    free_delivery_offer_discount: n(
      row.free_delivery_offer_discount ?? row.delivery_charge_discount,
    ),
    order_deductions: n(row.order_deductions),
    mechanism_fee: n(row.mechanism_fee ?? row.payment_mechanism_fee),
    customer_compensation: n(row.customer_compensation ?? row.refund_adjustments),
    cancellation_compensation: n(row.cancellation_compensation),
    other_credits: n(row.other_credits),
    withdrawal_reversal_credits: n(row.withdrawal_reversal_credits),
    manual_credits: n(row.manual_credits),
    adjustment_credits: n(row.adjustment_credits),
    gst_credits: n(row.gst_credits),
    penalty_reversal_credits: n(row.penalty_reversal_credits),
    penalties: n(row.penalties),
    refund_adjustments: n(row.refund_adjustments ?? row.customer_compensation),
    manual_debit_adjustments: n(row.manual_debit_adjustments),
    chargebacks: n(row.chargebacks),
    estimated_payout: n(row.estimated_payout ?? row.net_payout),
    order_count: n(row.delivered_orders) + n(row.rejected_orders),
    delivered_order_count: n(row.delivered_orders ?? row.delivered_order_count),
    rejected_order_count: n(row.rejected_orders ?? row.rejected_order_count),
  };
}
