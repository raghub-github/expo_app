/**
 * Parse orders_core.billing_snapshot for merchant bill / taxes breakdown modal.
 */

import { merchantFundedDiscountFromBilling } from "@/lib/merchant-billing-discount";

export type BillBreakdownLine = {
  key: string;
  label: string;
  amount: number;
  kind: "charge" | "tax" | "discount" | "total";
  sub?: string;
};

export type MerchantBillBreakdownModal = {
  taxLines: BillBreakdownLine[];
  taxTotal: number;
  fullLines: BillBreakdownLine[];
  finalAmount: number;
};

function asNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function readCompGst(comp: unknown): number {
  if (!comp || typeof comp !== "object") return 0;
  const c = comp as Record<string, unknown>;
  return round2(asNum(c.gst ?? c.tax));
}

function buildTaxLines(snap: Record<string, unknown>): BillBreakdownLine[] {
  const total = round2(asNum(snap.tax_total));
  const lines: BillBreakdownLine[] = [];
  const push = (key: string, label: string, amount: number, sub?: string) => {
    const a = round2(amount);
    if (a > 0.005) lines.push({ key, label, amount: a, kind: "tax", sub });
  };

  const gst = snap.gst_components;
  if (gst && typeof gst === "object") {
    const g = gst as Record<string, unknown>;
    push("food_gst", "GST on food", readCompGst(g.items), "Tax on food items after discounts.");
    push("delivery_gst", "GST on delivery fee", readCompGst(g.delivery));
    push("packaging_gst", "GST on packaging", readCompGst(g.packaging));
    push("platform_gst", "GST on platform fee", readCompGst(g.platform), "Tax on platform fee.");
    push("surge_gst", "GST on surge fee", readCompGst(g.surge));
    push("small_order_gst", "GST on small-order fee", readCompGst(g.small_order));
    push("convenience_gst", "GST on convenience fee", readCompGst(g.convenience));
    push("subscription_gst", "GST on subscription", readCompGst(g.subscription));
  }

  const taxesArr = Array.isArray(snap.taxes) ? snap.taxes : [];
  if (lines.length === 0 && taxesArr.length > 0) {
    for (let i = 0; i < taxesArr.length; i++) {
      const row = taxesArr[i];
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const label = String(r.label ?? r.name ?? "Tax").trim() || "Tax";
      push(`tax_${i}`, label, asNum(r.amount ?? r.tax));
    }
  }

  const accounted = round2(lines.reduce((s, l) => s + l.amount, 0));
  const remainder = round2(total - accounted);
  if (remainder > 0.005) {
    push("other_tax", "Other taxes", remainder);
  }
  if (lines.length === 0 && total > 0.005) {
    push("tax_total", "Taxes & charges", total);
  }
  return lines;
}

function pushCharge(
  lines: BillBreakdownLine[],
  key: string,
  label: string,
  amount: number
) {
  const a = round2(amount);
  if (a > 0.005) lines.push({ key, label, amount: a, kind: "charge" });
}

/** Full customer bill breakdown for modal (matches billing_snapshot). */
export function parseMerchantBillBreakdownModal(
  snapshot: Record<string, unknown> | null | undefined,
  fallback: {
    subtotal: number;
    packaging: number;
    taxes: number;
    discount: number;
    total: number;
  }
): MerchantBillBreakdownModal {
  const snap = snapshot ?? {};
  const hasSnap = snapshot != null && Object.keys(snapshot).length > 0;

  const itemTotal = round2(asNum(snap.item_total) + asNum(snap.addon_total));
  const subtotal = itemTotal > 0 ? itemTotal : fallback.subtotal;
  const packaging = hasSnap ? round2(asNum(snap.packaging_fee)) : fallback.packaging;
  const discount = hasSnap
    ? merchantFundedDiscountFromBilling(snap)
    : fallback.discount;
  const taxTotal = hasSnap ? round2(asNum(snap.tax_total)) : fallback.taxes;
  const finalAmount = hasSnap
    ? round2(asNum(snap.final_amount)) || fallback.total
    : fallback.total;

  const fullLines: BillBreakdownLine[] = [];

  if (subtotal > 0) {
    fullLines.push({
      key: "items",
      label: "Item subtotal",
      amount: subtotal,
      kind: "charge",
    });
  }
  pushCharge(fullLines, "packaging", "Restaurant packaging charges", packaging);
  pushCharge(fullLines, "delivery", "Delivery fee", asNum(snap.delivery_fee));
  pushCharge(fullLines, "platform", "Platform fee", asNum(snap.platform_fee));
  pushCharge(fullLines, "surge", "Surge fee", asNum(snap.surge_fee));
  pushCharge(fullLines, "small_order", "Small order fee", asNum(snap.small_order_fee));
  pushCharge(fullLines, "convenience", "Convenience fee", asNum(snap.convenience_fee));
  pushCharge(fullLines, "misc", "Other charges", asNum(snap.misc_fee));
  pushCharge(fullLines, "tip", "Tip", asNum(snap.tip_amount));
  pushCharge(fullLines, "donation", "Donation", asNum(snap.donation_amount));

  const taxLines = hasSnap ? buildTaxLines(snap) : [];
  if (taxTotal > 0.005) {
    if (taxLines.length > 0) {
      for (const tl of taxLines) fullLines.push(tl);
    } else {
      fullLines.push({
        key: "taxes",
        label: "Taxes",
        amount: taxTotal,
        kind: "tax",
      });
    }
  }

  if (discount > 0.005) {
    fullLines.push({
      key: "discount",
      label: "Discount",
      amount: discount,
      kind: "discount",
    });
  }

  const charges = Array.isArray(snap.charges) ? snap.charges : [];
  const seenKeys = new Set(fullLines.map((l) => l.key));
  for (let i = 0; i < charges.length; i++) {
    const row = charges[i];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
    if (meta.nonTaxable === true) continue;
    const src = String(meta.source ?? "");
    if (src === "checkout_tipAmount" || src === "checkout_donationAmount") continue;
    const label = String(r.label ?? "Charge").trim();
    const amount = asNum(r.amount);
    const key = `charge_${i}_${label}`;
    if (amount > 0.005 && !seenKeys.has(key)) {
      const dup = fullLines.some((l) => Math.abs(l.amount - amount) < 0.05 && l.label === label);
      if (!dup) {
        fullLines.push({ key, label, amount: round2(amount), kind: "charge" });
        seenKeys.add(key);
      }
    }
  }

  return {
    taxLines: taxLines.length > 0 ? taxLines : taxTotal > 0 ? [{ key: "taxes", label: "Taxes", amount: taxTotal, kind: "tax" }] : [],
    taxTotal,
    fullLines,
    finalAmount,
  };
}
