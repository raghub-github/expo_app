/** Shared types + helpers for GET /api/orders/[orderId]/items (order detail + refund modal). */

import type { OrderItemCustomisationDetail } from "@/lib/order-item-customisation";
import {
  customerDiscountLinesFromBilling,
  discountTotalFromBilling,
  type OrderDiscountOfferSource,
} from "@/lib/merchant-billing-discount";
import {
  extractGatiCashAppliedFromBilling,
  resolveCustomerCtcPaidAmount,
  roundCtcMoney,
} from "@/lib/orders/customer-ctc";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

export type OrderItemLineAmounts = {
  amountPerQuantity: number;
  taxPerQuantity: number;
  chargesPerQuantity: number;
  totalPerQuantity: number;
};

export type OrderItemApiRow = {
  id: number;
  name: string;
  customisation: string;
  customisationDetail?: OrderItemCustomisationDetail | null;
  quantity: number;
  /** Merchant (CTM) line amounts — default columns in items table. */
  amountPerQuantity: number;
  taxPerQuantity: number;
  chargesPerQuantity: number;
  totalPerQuantity: number;
  /** Customer (CTC) line amounts when bill view is Customer. */
  customer?: OrderItemLineAmounts;
  hasImage: boolean;
  imageUrl: string | null;
  status: string;
  /** Item-surface Boost / BOGO — partnersite & merchant app parity. */
  appliedOfferType?: string | null;
  offerLabel?: string | null;
  /** Original MX unit (before store offer). Merchant bill strike. */
  catalogAmountPerQuantity?: number;
  /** Discounted MX unit (what merchant is paid for the line). */
  netAmountPerQuantity?: number;
};

export type OrderPricingLine = {
  key: string;
  label: string;
  amount: number;
  kind: "charge" | "tax" | "discount";
  /** Platform vs store funding for discount lines. */
  discountTag?: "platform" | "store" | "mixed";
  /** Non-discount row badge (e.g. GMitra Plus membership fee). */
  rowBadge?: "membership";
};

export type OrderPricingSummary = {
  lines: OrderPricingLine[];
  itemsAmountTotal: number;
  packaging: number;
  packagingTax: number;
  gst: number;
  /** Amount customer actually paid for delivery (0 when membership waived). */
  deliveryFee: number;
  /** Pre-benefit quoted fee — use with deliveryFeeWaived for strikethrough UI. */
  deliveryFeeQuoted?: number;
  /** True when membership / free-delivery benefit zeroed the charged fee. */
  deliveryFeeWaived?: boolean;
  discount: number;
  platformFee: number;
  surgeFee: number;
  smallOrderFee: number;
  convenienceFee: number;
  miscFee: number;
  tipAmount: number;
  donationAmount: number;
  /** Full amount paid by customer (Cashin + GatiCash). */
  totalOrderAmount: number;
  /** Gateway / COD portion of CTC (excludes GatiCash). */
  cashinAmount?: number;
  /** GatiCash wallet used (payment — not a discount). */
  gatiCashUsed?: number;
};

/** Membership free-delivery display from billing_snapshot (mirrors customer checkout). */
export function resolveDeliveryFeeDisplayFromBilling(
  snap: Record<string, unknown> | null | undefined,
): { paid: number; quoted: number | null; waived: boolean } {
  if (!snap || typeof snap !== "object") {
    return { paid: 0, quoted: null, waived: false };
  }

  const paid = round2(asNum(snap.delivery_fee));
  const quotedRaw =
    asNum(snap.deliveryFeeQuotedInr) ||
    asNum(snap.delivery_fee_quoted) ||
    asNum(snap.deliveryFeeBeforeBenefitsInr) ||
    0;
  let waivedInr = asNum(snap.deliveryFeeWaivedInr);

  if (waivedInr <= 0.005) {
    const charges = Array.isArray(snap.charges) ? snap.charges : [];
    for (const raw of charges) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as { amount?: unknown; meta?: Record<string, unknown>; label?: unknown };
      const source = String(c.meta?.source ?? "");
      if (
        source === "customer_subscription_delivery_waived_marker" ||
        String(c.label ?? "") === "__delivery_fee_waived_inr__"
      ) {
        waivedInr = Math.abs(asNum(c.amount));
        if (waivedInr > 0.005) break;
      }
    }
  }

  if (waivedInr <= 0.005) {
    const discounts = Array.isArray(snap.discounts) ? snap.discounts : [];
    for (const raw of discounts) {
      if (!raw || typeof raw !== "object") continue;
      const d = raw as { amount?: unknown; meta?: Record<string, unknown> };
      if (String(d.meta?.source ?? "") === "customer_subscription_free_delivery") {
        waivedInr = Math.abs(asNum(d.amount));
        if (waivedInr > 0.005) break;
      }
    }
  }

  /** Strike-through only when membership actually reduced what the customer paid. */
  const subscriptionReduced = waivedInr > 0.005;
  const quotedCandidate = subscriptionReduced
    ? Math.max(waivedInr, quotedRaw, paid)
    : 0;
  const quoted = quotedCandidate > 0.005 ? round2(quotedCandidate) : null;

  return {
    paid,
    quoted: subscriptionReduced && quoted != null && quoted > paid + 0.005 ? quoted : null,
    /** Membership free delivery: charged fee is 0 but quoted amount remains for strikethrough. */
    waived: Boolean(subscriptionReduced && quoted != null && paid <= 0.005),
  };
}

export type OrderItemsPricing = OrderPricingSummary & {
  /** Merchant-facing bill lines (CTM view — matches partnersite / merchant app). */
  /** Full customer-facing bill breakdown. */
  customer?: OrderPricingSummary | null;
};

export type OrderItemsPayload = {
  items: OrderItemApiRow[];
  pricing: OrderItemsPricing;
};

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** GatiCash / missed-offer checkout lines stored on billing_snapshot.checkoutAdjustments.
 *  GatiCash is a payment settlement — never emitted as a discount line. */
function checkoutAdjustmentLinesFromOrder(
  snap: Record<string, unknown> | null,
  checkoutMeta: Record<string, unknown> | null
): OrderPricingLine[] {
  const out: OrderPricingLine[] = [];
  const adjRaw = snap?.checkoutAdjustments;
  const adj =
    adjRaw && typeof adjRaw === "object" ? (adjRaw as Record<string, unknown>) : null;

  const pushFromFields = (fields: {
    missedOfferDiscount: number;
    missedOfferWalletAdd: number;
    offerTitle?: string;
  }) => {
    const { missedOfferDiscount, missedOfferWalletAdd, offerTitle } = fields;
    if (missedOfferDiscount > 0.005) {
      out.push({
        key: "missed_offer_discount",
        label: offerTitle ? `${offerTitle} unlocked` : "Offer unlocked",
        amount: round2(missedOfferDiscount),
        kind: "discount",
      });
    }
    if (missedOfferWalletAdd > 0.005) {
      out.push({
        key: "missed_offer_wallet_add",
        label: "Add to GatiCash wallet (unlock offer)",
        amount: round2(missedOfferWalletAdd),
        kind: "charge",
      });
    }
  };

  if (adj) {
    const customLines = Array.isArray(adj.lines) ? adj.lines : [];
    if (customLines.length > 0) {
      customLines.forEach((raw, i) => {
        if (!raw || typeof raw !== "object") return;
        const row = raw as Record<string, unknown>;
        const kindKey = String(row.kind ?? "");
        // Payment settlement — not a bill discount.
        if (kindKey === "gati_cash_applied") return;
        const signed = asNum(row.amount);
        const amount = round2(Math.abs(signed));
        if (amount <= 0.005) return;
        const isDiscount =
          signed < 0 || kindKey === "missed_offer_discount";
        out.push({
          key: `checkout_adj_${kindKey || i}`,
          label: String(row.label ?? "Checkout adjustment").trim() || "Checkout adjustment",
          amount,
          kind: isDiscount ? "discount" : "charge",
        });
      });
      if (out.length > 0) return out;
    }

    const comp =
      adj.missedOfferCompensation && typeof adj.missedOfferCompensation === "object"
        ? (adj.missedOfferCompensation as Record<string, unknown>)
        : null;
    pushFromFields({
      missedOfferDiscount: asNum(adj.missedOfferDiscount),
      missedOfferWalletAdd: asNum(adj.missedOfferWalletAdd),
      offerTitle: comp?.offerTitle != null ? String(comp.offerTitle) : undefined,
    });
    if (out.length > 0) return out;
  }

  if (!checkoutMeta) return out;

  const compRaw = checkoutMeta.missedOfferCompensation;
  const comp =
    compRaw && typeof compRaw === "object" ? (compRaw as Record<string, unknown>) : null;
  pushFromFields({
    missedOfferDiscount: asNum(comp?.discountInr),
    missedOfferWalletAdd: asNum(comp?.amountInr),
    offerTitle:
      comp?.offerTitle != null ? String(comp.offerTitle).trim() : undefined,
  });
  return out;
}

function packagingTaxFromBilling(snap: Record<string, unknown> | null): number {
  if (!snap) return 0;
  const gst = snap.gst_components;
  if (gst && typeof gst === "object") {
    const packaging = (gst as Record<string, unknown>).packaging;
    if (packaging && typeof packaging === "object") {
      return asNum((packaging as Record<string, unknown>).tax);
    }
  }
  const taxes = Array.isArray(snap.taxes) ? snap.taxes : [];
  let sum = 0;
  for (const t of taxes) {
    const row = t as Record<string, unknown>;
    const group = String(row.tax_group ?? row.taxGroup ?? "").toLowerCase();
    if (group === "packaging") sum += asNum(row.tax ?? row.amount);
  }
  return sum;
}

/** True when this charge line is already shown via a dedicated named fee row. */
function isChargeCoveredByNamedFeeBucket(
  label: string,
  meta: Record<string, unknown> | null
): boolean {
  const u = label.trim().toLowerCase();
  const source = String(meta?.source ?? meta?.bucket ?? meta?.ruleType ?? "").toLowerCase();
  if (
    u.includes("delivery") ||
    source.includes("delivery") ||
    source === "delivery"
  ) {
    return true;
  }
  if (u.includes("packaging") || source.includes("packaging")) return true;
  if (u.includes("platform") || source.includes("platform")) return true;
  if (u.includes("surge") || source.includes("surge")) return true;
  if (u.includes("small order") || source.includes("small_order")) return true;
  if (u.includes("convenience") || source.includes("convenience")) return true;
  if (u.includes("tip") || source.includes("tip") || source.includes("rider_tip")) return true;
  if (u.includes("donation") || source.includes("donation")) return true;
  return false;
}

function isMembershipChargeLine(
  label: string,
  meta: Record<string, unknown> | null
): boolean {
  const source = String(meta?.source ?? "").toLowerCase();
  const ruleType = String(meta?.ruleType ?? meta?.rule_type ?? "").toLowerCase();
  const u = label.toLowerCase();
  if (
    source.includes("subscription") ||
    source.includes("membership") ||
    source.includes("gmitra") ||
    ruleType.includes("subscription") ||
    ruleType.includes("membership")
  ) {
    return true;
  }
  return (
    u.includes("gmitra") ||
    u.includes("membership") ||
    u.includes("subscription") ||
    u.includes("gati plus") ||
    u.includes("gmitra plus")
  );
}

/**
 * Named misc / subscription / custom fee lines from billing_snapshot.charges
 * (never collapse to a generic "Other Charges" bucket).
 */
function namedExtraChargeLinesFromBilling(
  snap: Record<string, unknown>
): OrderPricingLine[] {
  const out: OrderPricingLine[] = [];
  const charges = Array.isArray(snap.charges) ? snap.charges : [];
  let i = 0;
  for (const raw of charges) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (String(row.kind ?? "charge").toLowerCase() === "discount") continue;
    if (String(row.kind ?? "").toLowerCase() === "tax") continue;
    if (row.hidden === true) continue;
    const amount = round2(asNum(row.amount));
    if (amount <= 0.005) continue;
    const label = String(row.label ?? "").trim();
    if (!label) continue;
    const meta =
      row.meta && typeof row.meta === "object"
        ? (row.meta as Record<string, unknown>)
        : null;
    if (isChargeCoveredByNamedFeeBucket(label, meta)) continue;
    const ruleId = row.ruleId != null ? String(row.ruleId) : String(i);
    out.push({
      key: `named_charge_${ruleId}_${i}`,
      label,
      amount,
      kind: "charge",
      rowBadge: isMembershipChargeLine(label, meta) ? "membership" : undefined,
    });
    i += 1;
  }
  return out;
}

/**
 * Customer (CTC) bill from billing_snapshot + orders_core.
 * CTC = Cashin + GatiCash (full amount paid by customer). Never treat GatiCash as a discount.
 * `orders_core.grand_total` alone is post-wallet to-pay — not CTC.
 */
export function buildOrderPricingSummary(
  billingSnap: Record<string, unknown> | null,
  core: Record<string, unknown>
): OrderItemsPricing {
  const snap = billingSnap ?? {};
  const lines: OrderPricingLine[] = [];

  const pushCharge = (key: string, label: string, amount: number) => {
    const n = round2(amount);
    if (n > 0) lines.push({ key, label, amount: n, kind: "charge" });
  };

  const itemTotal =
    round2(asNum(snap.item_total) + asNum(snap.addon_total)) ||
    round2(asNum(core.item_total) + asNum(core.addon_total));

  if (itemTotal > 0) {
    lines.push({ key: "items", label: "Items Amount Total", amount: itemTotal, kind: "charge" });
  }

  const packaging = round2(asNum(snap.packaging_fee));
  const packagingTax = round2(packagingTaxFromBilling(snap));
  const platformFee = round2(asNum(snap.platform_fee));
  const surgeFee = round2(asNum(snap.surge_fee));
  const smallOrderFee = round2(asNum(snap.small_order_fee));
  const convenienceFee = round2(asNum(snap.convenience_fee));
  const miscFee = round2(asNum(snap.misc_fee));
  const deliveryFee = round2(asNum(snap.delivery_fee));
  const deliveryDisplay = resolveDeliveryFeeDisplayFromBilling(snap);
  const gst = round2(asNum(snap.tax_total));
  const tipAmount = round2(
    asNum(snap.tip_amount) || asNum(core.tip_amount) || asNum(core.tipAmount)
  );
  const donationAmount = round2(
    asNum(snap.donation_amount) || asNum(core.donation_amount) || asNum(core.donationAmount)
  );
  const discount = discountTotalFromBilling(snap);

  pushCharge("packaging", "Packaging", packaging);
  if (packagingTax > 0 && gst <= 0) {
    lines.push({ key: "packaging_tax", label: "Packaging Tax", amount: packagingTax, kind: "tax" });
  }
  pushCharge("platform", "Platform Fee", platformFee);
  pushCharge("surge", "Surge Fee", surgeFee);
  pushCharge("small_order", "Small Order Fee", smallOrderFee);
  pushCharge("convenience", "Convenience Fee", convenienceFee);

  const namedExtras = namedExtraChargeLinesFromBilling(snap);
  for (const line of namedExtras) lines.push(line);

  // Only if snapshot has misc_fee but no named charge lines, surface the fee with a clear label.
  const namedExtrasSum = round2(namedExtras.reduce((s, l) => s + l.amount, 0));
  const miscResidual = round2(Math.max(0, miscFee - namedExtrasSum));
  if (miscResidual > 0.005 && namedExtras.length === 0) {
    let labeled = false;
    const gstComponents =
      snap.gst_components && typeof snap.gst_components === "object"
        ? (snap.gst_components as Record<string, unknown>)
        : null;
    const subscription =
      gstComponents?.subscription && typeof gstComponents.subscription === "object"
        ? (gstComponents.subscription as Record<string, unknown>)
        : null;
    const subscriptionOriginal = round2(asNum(subscription?.original));
    if (subscriptionOriginal > 0.005 && Math.abs(subscriptionOriginal - miscResidual) <= 0.02) {
      lines.push({
        key: "subscription",
        label: "Subscription",
        amount: miscResidual,
        kind: "charge",
        rowBadge: "membership",
      });
      labeled = true;
    }
    if (!labeled) {
      const steps = Array.isArray(snap.breakdown_steps) ? snap.breakdown_steps : [];
      for (const step of steps) {
        if (!step || typeof step !== "object") continue;
        const row = step as Record<string, unknown>;
        const amt = round2(asNum(row.amount));
        if (Math.abs(amt - miscResidual) > 0.02) continue;
        const stepLabel = String(row.step ?? "").trim();
        if (!stepLabel || isChargeCoveredByNamedFeeBucket(stepLabel, null)) continue;
        lines.push({
          key: "misc_named",
          label: stepLabel,
          amount: miscResidual,
          kind: "charge",
          rowBadge: isMembershipChargeLine(stepLabel, null) ? "membership" : undefined,
        });
        labeled = true;
        break;
      }
    }
    if (!labeled) {
      pushCharge("misc", "Additional fee", miscResidual);
    }
  }

  pushCharge("delivery", "Delivery Fee", deliveryFee);
  if (gst > 0) {
    lines.push({ key: "gst", label: "GST", amount: gst, kind: "tax" });
  }

  if (discount > 0) {
    const discountLines = customerDiscountLinesFromBilling(snap);
    if (discountLines.length > 0) {
      discountLines.forEach((d, i) => {
        lines.push({
          key: `discount_${i}`,
          label: d.label,
          amount: d.amount,
          kind: "discount",
          discountTag: d.tag,
        });
      });
    } else {
      lines.push({
        key: "discount",
        label: resolveNamedDiscountFallbackLabel(snap) ?? "Discount",
        amount: discount,
        kind: "discount",
      });
    }
  }

  const checkoutMeta =
    core.checkout_metadata && typeof core.checkout_metadata === "object"
      ? (core.checkout_metadata as Record<string, unknown>)
      : null;
  for (const adjLine of checkoutAdjustmentLinesFromOrder(snap, checkoutMeta)) {
    lines.push(adjLine);
  }

  const gatiCashUsed = extractGatiCashAppliedFromBilling(snap, checkoutMeta);
  const netPayable = round2(
    asNum(core.grand_total) ||
      asNum(snap.grand_total) ||
      asNum(snap.final_amount) ||
      asNum(snap.final_payable) ||
      0
  );
  const { ctc: baseCtc, cashin: cashinAmount } = resolveCustomerCtcPaidAmount({
    netPayable,
    gatiCashUsed,
  });

  const sumBeforeTipDonation = round2(
    lines.reduce((s, l) => (l.kind === "discount" ? s - l.amount : s + l.amount), 0)
  );

  // Only show tip when it is part of CTC. Phantom tip_amount (not in grand_total)
  // previously produced Tip +5 cancelled by fake "Bill credit" −5.
  let shownTip = 0;
  if (tipAmount > 0.005) {
    const withTip = round2(sumBeforeTipDonation + tipAmount);
    if (Math.abs(withTip - baseCtc) <= 0.05) {
      pushCharge("tip", "Tip", tipAmount);
      shownTip = tipAmount;
    }
  }

  let sumAfterTip = round2(
    lines.reduce((s, l) => (l.kind === "discount" ? s - l.amount : s + l.amount), 0)
  );
  let shownDonation = 0;
  if (donationAmount > 0.005) {
    const withDonation = round2(sumAfterTip + donationAmount);
    if (Math.abs(withDonation - baseCtc) <= 0.05) {
      pushCharge("donation", "Donation", donationAmount);
      shownDonation = donationAmount;
    }
  }

  const totalOrderAmount = baseCtc;

  const linesSum = round2(
    lines.reduce((s, l) => {
      if (l.kind === "discount") return s - l.amount;
      return s + l.amount;
    }, 0)
  );

  const diff = round2(totalOrderAmount - linesSum);
  if (Math.abs(diff) >= 0.01) {
    const abs = Math.abs(diff);
    // GatiCash is payment settlement (CTC split) — never a bill discount line.
    const isGatiResidual =
      diff < 0 && gatiCashUsed > 0.005 && Math.abs(abs - gatiCashUsed) <= 0.02;
    if (!isGatiResidual) {
      const label =
        diff > 0
          ? "Bill rounding"
          : resolveBillCreditLabel(snap, abs, lines) ??
            resolveNamedDiscountFallbackLabel(snap) ??
            "Discount";
      lines.push({
        key: "adjustment",
        label,
        amount: abs,
        kind: diff > 0 ? "charge" : "discount",
      });
    }
  }

  return {
    lines,
    itemsAmountTotal: itemTotal,
    packaging,
    packagingTax,
    gst,
    deliveryFee,
    deliveryFeeQuoted: deliveryDisplay.quoted ?? undefined,
    deliveryFeeWaived: deliveryDisplay.waived || undefined,
    discount,
    platformFee,
    surgeFee,
    smallOrderFee,
    convenienceFee,
    miscFee,
    tipAmount: shownTip,
    donationAmount: shownDonation,
    totalOrderAmount,
    cashinAmount,
    gatiCashUsed: gatiCashUsed > 0.005 ? roundCtcMoney(gatiCashUsed) : undefined,
  };
}

/** Prefer real offer/coupon titles over generic "Discount" / "Bill credit". */
function resolveNamedDiscountFallbackLabel(snap: Record<string, unknown>): string | null {
  const candidates = [
    snap.offer_title,
    snap.offerTitle,
    snap.coupon_title,
    snap.couponTitle,
    snap.promo_title,
    snap.promoTitle,
    snap.coupon_code,
    snap.couponCode,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  const discounts = Array.isArray(snap.discounts) ? snap.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const label = String(row.label ?? row.step ?? row.title ?? "").trim();
    if (label) return label;
  }
  return null;
}

function resolveBillCreditLabel(
  snap: Record<string, unknown>,
  amount: number,
  existingLines: OrderPricingLine[]
): string | null {
  const existing = new Set(existingLines.map((l) => l.label.trim().toLowerCase()));
  const discountLines = customerDiscountLinesFromBilling(snap);
  for (const d of discountLines) {
    if (Math.abs(d.amount - amount) > 0.02) continue;
    if (existing.has(d.label.trim().toLowerCase())) continue;
    return d.label;
  }
  const named = resolveNamedDiscountFallbackLabel(snap);
  if (named && !existing.has(named.trim().toLowerCase())) return named;

  const steps = Array.isArray(snap.breakdown_steps) ? snap.breakdown_steps : [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const row = step as Record<string, unknown>;
    const amt = round2(Math.abs(asNum(row.amount)));
    if (Math.abs(amt - amount) > 0.02) continue;
    const kind = String(row.kind ?? row.type ?? "").toLowerCase();
    const stepLabel = String(row.step ?? row.label ?? row.title ?? "").trim();
    if (!stepLabel) continue;
    if (kind && !kind.includes("discount") && asNum(row.amount) >= 0) continue;
    if (existing.has(stepLabel.toLowerCase())) continue;
    return stepLabel;
  }
  return null;
}

function parsePricingSummary(pr: Record<string, unknown>): OrderPricingSummary {
  const lines = Array.isArray(pr.lines)
    ? (pr.lines as OrderPricingLine[])
    : buildOrderPricingSummary(null, {}).lines;

  return {
    lines,
    itemsAmountTotal: Number(pr.itemsAmountTotal) || 0,
    packaging: Number(pr.packaging) || 0,
    packagingTax: Number(pr.packagingTax) || 0,
    gst: Number(pr.gst) || 0,
    deliveryFee: Number(pr.deliveryFee) || 0,
    deliveryFeeQuoted:
      pr.deliveryFeeQuoted != null && Number(pr.deliveryFeeQuoted) > 0
        ? Number(pr.deliveryFeeQuoted)
        : undefined,
    deliveryFeeWaived: Boolean(pr.deliveryFeeWaived) || undefined,
    discount: Number(pr.discount) || 0,
    platformFee: Number(pr.platformFee) || 0,
    surgeFee: Number(pr.surgeFee) || 0,
    smallOrderFee: Number(pr.smallOrderFee) || 0,
    convenienceFee: Number(pr.convenienceFee) || 0,
    miscFee: Number(pr.miscFee) || 0,
    tipAmount: Number(pr.tipAmount) || 0,
    donationAmount: Number(pr.donationAmount) || 0,
    totalOrderAmount: Number(pr.totalOrderAmount) || 0,
    cashinAmount:
      pr.cashinAmount != null && Number(pr.cashinAmount) >= 0
        ? Number(pr.cashinAmount)
        : undefined,
    gatiCashUsed:
      pr.gatiCashUsed != null && Number(pr.gatiCashUsed) > 0
        ? Number(pr.gatiCashUsed)
        : undefined,
  };
}

function parsePricingBlock(pr: Record<string, unknown>): OrderItemsPricing {
  const customerRaw = pr.customer;
  const customer =
    customerRaw && typeof customerRaw === "object"
      ? parsePricingSummary(customerRaw as Record<string, unknown>)
      : null;

  return {
    ...parsePricingSummary(pr),
    customer,
  };
}

/** Customer-facing discount from items API pricing (CTC bill, incl. platform offers). */
export function customerDiscountFromOrderPricing(
  pricing: OrderItemsPricing | null | undefined,
): { amount: number | null; offerSource: OrderDiscountOfferSource | null } {
  if (!pricing) return { amount: null, offerSource: null };

  const customer = pricing.customer ?? pricing;
  const discountLines = customer.lines?.filter((l) => l.kind === "discount") ?? [];

  if (discountLines.length > 0) {
    const amount = discountLines.reduce((s, l) => s + Math.abs(l.amount), 0);
    if (amount <= 0) return { amount: null, offerSource: null };

    const tags = new Set(
      discountLines
        .map((l) => l.discountTag)
        .filter(Boolean) as Array<"platform" | "store" | "mixed">,
    );
    let offerSource: OrderDiscountOfferSource | null = null;
    if (tags.size === 1) {
      const only = [...tags][0];
      offerSource =
        only === "platform" ? "Platform" : only === "store" ? "Store" : "Mixed";
    } else if (tags.size > 1) {
      offerSource = "Mixed";
    }
    return { amount, offerSource };
  }

  if (customer.discount != null && customer.discount > 0) {
    return { amount: customer.discount, offerSource: null };
  }

  return { amount: null, offerSource: null };
}

/** Delivery fee for payment card — prefers customer bill + membership strike fields. */
export function customerDeliveryFromOrderPricing(
  pricing: OrderItemsPricing | null | undefined,
): { amount: number | null; quoted: number | null; waived: boolean } {
  if (!pricing) return { amount: null, quoted: null, waived: false };

  const customer = pricing.customer ?? pricing;
  const paid = customer.deliveryFee ?? pricing.deliveryFee ?? 0;
  const quoted =
    customer.deliveryFeeQuoted ??
    pricing.deliveryFeeQuoted ??
    null;
  const waived = Boolean(
    customer.deliveryFeeWaived || pricing.deliveryFeeWaived,
  );

  if (waived && quoted != null && quoted > 0) {
    return { amount: quoted, quoted, waived: true };
  }
  if (paid > 0) return { amount: paid, quoted, waived: false };
  if (quoted != null && quoted > 0) return { amount: quoted, quoted, waived: false };
  return { amount: null, quoted, waived: false };
}

export function parseOrderItemsApiResponse(data: unknown): OrderItemsPayload | null {
  if (!data || typeof data !== "object") return null;
  const body = data as { success?: boolean; items?: unknown; pricing?: unknown };
  if (!body.success) return null;
  const rows = Array.isArray(body.items) ? body.items : [];
  const p = body.pricing;
  if (!p || typeof p !== "object") {
    return {
      items: rows as OrderItemApiRow[],
      pricing: buildOrderPricingSummary(null, {}),
    };
  }

  return {
    items: rows as OrderItemApiRow[],
    pricing: parsePricingBlock(p as Record<string, unknown>),
  };
}

/** Preload menu images in the browser cache (call when items list is known). */
export function preloadOrderItemImages(urls: string[]): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (!url) continue;
    const resolved = resolveAttachmentProxyUrl(url) || url;
    const img = new window.Image();
    img.decoding = "async";
    img.src = resolved;
  }
}

const orderItemsCache = new Map<number, OrderItemsPayload>();
const orderItemsInflight = new Map<number, Promise<OrderItemsPayload | null>>();

export function getCachedOrderItems(orderId: number): OrderItemsPayload | null {
  return orderItemsCache.get(orderId) ?? null;
}

export function seedOrderItemsCache(orderId: number, payload: OrderItemsPayload): void {
  if (payload.items?.length) {
    orderItemsCache.set(orderId, payload);
  }
}

/** Deduped fetch — order detail + items modal share the same in-memory cache. */
export function fetchOrderItemsCached(orderId: number): Promise<OrderItemsPayload | null> {
  const cached = orderItemsCache.get(orderId);
  // Stale entries from before offer badges existed — force a fresh load.
  const cacheHasOfferFields =
    Boolean(cached?.items?.length) &&
    cached!.items.every((row) => "appliedOfferType" in row || "offerLabel" in row);
  if (cacheHasOfferFields) return Promise.resolve(cached!);

  const inflight = orderItemsInflight.get(orderId);
  if (inflight) return inflight;

  const request = fetch(`/api/orders/${orderId}/items`, {
    credentials: "include",
    cache: "no-store",
  })
    .then((res) => res.json())
    .then((body) => parseOrderItemsApiResponse(body))
    .then((parsed) => {
      if (parsed?.items?.length) orderItemsCache.set(orderId, parsed);
      return parsed;
    })
    .catch(() => null)
    .finally(() => {
      orderItemsInflight.delete(orderId);
    });

  orderItemsInflight.set(orderId, request);
  return request;
}
