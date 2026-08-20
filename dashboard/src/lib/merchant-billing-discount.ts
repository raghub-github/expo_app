/**
 * Merchant-facing bill: only restaurant-funded discounts count.
 * Platform / GatiMitra offers are excluded from merchant totals.
 */

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nestedNum(obj: unknown, key: string): number {
  if (!obj || typeof obj !== "object") return 0;
  return num((obj as Record<string, unknown>)[key]);
}

/** Parse billing_snapshot from DB (object or JSON string). */
export function parseBillingSnapshot(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

/** Total discount from snapshot (snake_case, camelCase, or nested totals). */
export function discountTotalFromBilling(
  billing: Record<string, unknown> | null | undefined,
): number {
  if (!billing || typeof billing !== "object") return 0;
  const totals = billing.totals;
  const gstTotals = billing.gst_totals ?? billing.gstTotals;
  return round2(
    num(billing.discount_total) ||
      num(billing.discountTotal) ||
      nestedNum(totals, "total_discount") ||
      nestedNum(gstTotals, "total_discount") ||
      0,
  );
}

function metaOf(row: Record<string, unknown>): Record<string, unknown> | null {
  const m = row.meta;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
}

/** Per discount line: amount that affects merchant bill (₹). */
export function merchantFundedAmountFromDiscountLine(
  row: Record<string, unknown>,
): number {
  const amount = num(row.amount);
  if (amount <= 0) return 0;

  const meta = metaOf(row);

  if (meta?.merchantOfferId != null && String(meta.merchantOfferId).trim() !== "") {
    return round2(amount);
  }

  if (meta?.platformOfferId != null && String(meta.platformOfferId).trim() !== "") {
    const merchantContrib =
      num(meta.merchantContribution) ??
      num(meta.merchant_contribution) ??
      num(row.merchantShare) ??
      0;
    return round2(Math.max(0, merchantContrib));
  }

  const source = String(
    row.offerSource ?? row.offer_source ?? meta?.source ?? "",
  ).toUpperCase();

  if (source === "PLATFORM") return 0;
  if (
    source === "MERCHANT" ||
    source === "MERCHANT_OFFERS" ||
    source === "merchant_offers"
  ) {
    return round2(amount);
  }

  if (source === "COUPON") {
    if (meta?.merchantOfferId != null) return round2(amount);
    return 0;
  }

  return 0;
}

export function merchantFundedDiscountFromBilling(
  billing: Record<string, unknown> | null | undefined,
): number {
  if (!billing || typeof billing !== "object") return 0;
  let sum = 0;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    sum += merchantFundedAmountFromDiscountLine(d as Record<string, unknown>);
  }
  return round2(sum);
}

export type MerchantDiscountLine = { label: string; amount: number };

export type DiscountFundingTag = "platform" | "store" | "mixed";

/** Whether discount is funded by platform, store, or both. */
export function discountFundingTagFromLine(
  row: Record<string, unknown>,
): DiscountFundingTag {
  const amount = Math.abs(num(row.amount));
  if (amount <= 0) return "platform";
  const merchantAmt = merchantFundedAmountFromDiscountLine(row);
  if (merchantAmt >= amount - 0.01) return "store";
  if (merchantAmt <= 0.01) return "platform";
  return "mixed";
}

export function customerDiscountLinesFromBilling(
  billing: Record<string, unknown> | null | undefined,
): Array<{ label: string; amount: number; tag: DiscountFundingTag }> {
  const out: Array<{ label: string; amount: number; tag: DiscountFundingTag }> = [];
  if (!billing || typeof billing !== "object") return out;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const amt = Math.abs(num(row.amount));
    if (amt <= 0) continue;
    const label =
      String(row.label ?? row.step ?? "Discount").trim() || "Discount";
    out.push({ label, amount: round2(amt), tag: discountFundingTagFromLine(row) });
  }
  return out;
}

export function merchantFundedDiscountLinesFromBilling(
  billing: Record<string, unknown> | null | undefined,
): MerchantDiscountLine[] {
  const out: MerchantDiscountLine[] = [];
  if (!billing || typeof billing !== "object") return out;
  const discounts = Array.isArray(billing.discounts) ? billing.discounts : [];
  for (const d of discounts) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const amt = merchantFundedAmountFromDiscountLine(row);
    if (amt <= 0) continue;
    const label =
      String(row.label ?? row.step ?? "Restaurant discount").trim() ||
      "Restaurant discount";
    out.push({ label, amount: amt });
  }
  return out;
}

/**
 * Store Boost / % / flat baked into the item price (no discounts[] row).
 * Customer savings = list/strike CTC − paid CTC.
 * Merchant offer = MX rupees the restaurant funded (same as Items merchant bill).
 */
export function bakedInItemOfferAmountsFromBilling(
  billing: Record<string, unknown> | null | undefined,
): { customerAmount: number; merchantAmount: number; label: string | null } {
  if (!billing || typeof billing !== "object") {
    return { customerAmount: 0, merchantAmount: 0, label: null };
  }
  const rows = billing.order_line_pricing ?? billing.orderLinePricing;
  if (!Array.isArray(rows)) {
    return { customerAmount: 0, merchantAmount: 0, label: null };
  }

  let customerAmount = 0;
  let merchantAmount = 0;
  let label: string | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const listed = Math.abs(num(r.offerDiscountAmount ?? r.offer_discount_amount));
    if (listed > 0.005) continue;
    const canon = r.canonical_pricing ?? r.canonicalPricing;
    if (!canon || typeof canon !== "object") continue;
    const c = canon as Record<string, unknown>;
    const strike = num(c.customer_strike_line ?? c.customerStrikeLine);
    const paid = num(c.customer_item_price_line ?? c.customerItemPriceLine);
    const merchDisc = num(c.merchant_discount_amount ?? c.merchantDiscountAmount);
    if (merchDisc > 0.005) merchantAmount = round2(merchantAmount + merchDisc);
    if (strike > paid + 0.005) customerAmount = round2(customerAmount + (strike - paid));
    else if (merchDisc > 0.005) customerAmount = round2(customerAmount + merchDisc);
    const name = String(
      c.merchant_offer_name ??
        c.merchantOfferName ??
        r.appliedOfferLabel ??
        r.applied_offer_label ??
        ""
    ).trim();
    if (!label && name) label = name;
  }
  return { customerAmount, merchantAmount, label };
}

/** @deprecated use bakedInItemOfferAmountsFromBilling */
export function bakedInItemOfferCustomerSavingsFromBilling(
  billing: Record<string, unknown> | null | undefined,
): { amount: number; label: string | null } {
  const baked = bakedInItemOfferAmountsFromBilling(billing);
  return { amount: baked.customerAmount, label: baked.label };
}

export type OrderDiscountOfferSource = "Platform" | "Store" | "Mixed";

/** Customer-facing discount on the order (excludes cashback lines). */
export function orderDiscountGrantedSummaryFromBilling(
  billing: Record<string, unknown> | null | undefined,
): {
  amount: number | null;
  merchantStoreOffer: number | null;
  offerSource: OrderDiscountOfferSource | null;
} {
  if (!billing || typeof billing !== "object") {
    return { amount: null, merchantStoreOffer: null, offerSource: null };
  }

  const lines = customerDiscountLinesFromBilling(billing).filter(
    (l) => !l.label.toLowerCase().includes("cashback"),
  );
  const baked = bakedInItemOfferAmountsFromBilling(billing);

  const listedAmount =
    lines.length > 0
      ? round2(lines.reduce((s, l) => s + l.amount, 0))
      : discountTotalFromBilling(billing);
  const listedStore = round2(
    lines.filter((l) => l.tag === "store").reduce((s, l) => s + l.amount, 0)
  );
  const customerAmount = round2(Math.max(0, listedAmount) + Math.max(0, baked.customerAmount));
  const merchantStoreOffer = round2(Math.max(0, listedStore) + Math.max(0, baked.merchantAmount));
  if (customerAmount <= 0.005 && merchantStoreOffer <= 0.005) {
    return { amount: null, merchantStoreOffer: null, offerSource: null };
  }

  const tags = new Set(lines.map((l) => l.tag));
  if (baked.customerAmount > 0.005 || baked.merchantAmount > 0.005) tags.add("store");

  let offerSource: OrderDiscountOfferSource | null = null;
  if (tags.size === 1) {
    const only = [...tags][0];
    offerSource =
      only === "platform" ? "Platform" : only === "store" ? "Store" : "Mixed";
  } else if (tags.size > 1) {
    offerSource = "Mixed";
  } else if (baked.merchantAmount > 0.005 || baked.customerAmount > 0.005) {
    offerSource = "Store";
  }

  return {
    amount: customerAmount > 0.005 ? customerAmount : null,
    merchantStoreOffer: merchantStoreOffer > 0.005 ? merchantStoreOffer : null,
    offerSource,
  };
}
