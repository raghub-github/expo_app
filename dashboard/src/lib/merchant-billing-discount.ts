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
  const amount = num(row.amount);
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
    const amt = num(row.amount);
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
