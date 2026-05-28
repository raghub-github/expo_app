/** Shared types + helpers for GET /api/orders/[orderId]/items (order detail + refund modal). */

import type { OrderItemCustomisationDetail } from "@/lib/order-item-customisation";
import { customerDiscountLinesFromBilling } from "@/lib/merchant-billing-discount";

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
};

export type OrderPricingLine = {
  key: string;
  label: string;
  amount: number;
  kind: "charge" | "tax" | "discount";
  /** Platform vs store funding for discount lines. */
  discountTag?: "platform" | "store" | "mixed";
};

export type OrderPricingSummary = {
  lines: OrderPricingLine[];
  itemsAmountTotal: number;
  packaging: number;
  packagingTax: number;
  gst: number;
  deliveryFee: number;
  discount: number;
  platformFee: number;
  surgeFee: number;
  smallOrderFee: number;
  convenienceFee: number;
  miscFee: number;
  tipAmount: number;
  donationAmount: number;
  totalOrderAmount: number;
};

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

/** Build pricing summary from billing_snapshot so footer math matches final_amount. */
export function buildOrderPricingSummary(
  billingSnap: Record<string, unknown> | null,
  core: Record<string, unknown>,
  foodTotal: string | number | null | undefined
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
  const gst = round2(asNum(snap.tax_total));
  const tipAmount = round2(asNum(snap.tip_amount));
  const donationAmount = round2(asNum(snap.donation_amount));
  const discount = round2(asNum(snap.discount_total));

  pushCharge("packaging", "Packaging", packaging);
  if (packagingTax > 0 && gst <= 0) {
    lines.push({ key: "packaging_tax", label: "Packaging Tax", amount: packagingTax, kind: "tax" });
  }
  pushCharge("platform", "Platform Fee", platformFee);
  pushCharge("surge", "Surge Fee", surgeFee);
  pushCharge("small_order", "Small Order Fee", smallOrderFee);
  pushCharge("convenience", "Convenience Fee", convenienceFee);
  pushCharge("misc", "Other Charges", miscFee);
  pushCharge("delivery", "Delivery Fee", deliveryFee);
  if (gst > 0) {
    lines.push({ key: "gst", label: "GST", amount: gst, kind: "tax" });
  }
  pushCharge("tip", "Tip", tipAmount);
  pushCharge("donation", "Donation", donationAmount);

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
      lines.push({ key: "discount", label: "Discount", amount: discount, kind: "discount" });
    }
  }

  const foodNum = foodTotal != null && foodTotal !== "" ? Number(foodTotal) : NaN;
  const totalOrderAmount = round2(
    Number.isFinite(foodNum)
      ? foodNum
      : asNum(snap.final_amount) || asNum(core.grand_total) || 0
  );

  const linesSum = round2(
    lines.reduce((s, l) => {
      if (l.kind === "discount") return s - l.amount;
      return s + l.amount;
    }, 0)
  );

  const diff = round2(totalOrderAmount - linesSum);
  if (Math.abs(diff) >= 0.01) {
    lines.push({
      key: "adjustment",
      label: diff > 0 ? "Additional charges" : "Adjustment",
      amount: Math.abs(diff),
      kind: diff > 0 ? "charge" : "discount",
    });
  }

  return {
    lines,
    itemsAmountTotal: itemTotal,
    packaging,
    packagingTax,
    gst,
    deliveryFee,
    discount,
    platformFee,
    surgeFee,
    smallOrderFee,
    convenienceFee,
    miscFee,
    tipAmount,
    donationAmount,
    totalOrderAmount,
  };
}

function parsePricingSummary(pr: Record<string, unknown>): OrderPricingSummary {
  const lines = Array.isArray(pr.lines)
    ? (pr.lines as OrderPricingLine[])
    : buildOrderPricingSummary(null, {}, null).lines;

  return {
    lines,
    itemsAmountTotal: Number(pr.itemsAmountTotal) || 0,
    packaging: Number(pr.packaging) || 0,
    packagingTax: Number(pr.packagingTax) || 0,
    gst: Number(pr.gst) || 0,
    deliveryFee: Number(pr.deliveryFee) || 0,
    discount: Number(pr.discount) || 0,
    platformFee: Number(pr.platformFee) || 0,
    surgeFee: Number(pr.surgeFee) || 0,
    smallOrderFee: Number(pr.smallOrderFee) || 0,
    convenienceFee: Number(pr.convenienceFee) || 0,
    miscFee: Number(pr.miscFee) || 0,
    tipAmount: Number(pr.tipAmount) || 0,
    donationAmount: Number(pr.donationAmount) || 0,
    totalOrderAmount: Number(pr.totalOrderAmount) || 0,
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

export function parseOrderItemsApiResponse(data: unknown): OrderItemsPayload | null {
  if (!data || typeof data !== "object") return null;
  const body = data as { success?: boolean; items?: unknown; pricing?: unknown };
  if (!body.success) return null;
  const rows = Array.isArray(body.items) ? body.items : [];
  const p = body.pricing;
  if (!p || typeof p !== "object") {
    return {
      items: rows as OrderItemApiRow[],
      pricing: buildOrderPricingSummary(null, {}, null),
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
    const img = new window.Image();
    img.decoding = "async";
    img.src = url;
  }
}
