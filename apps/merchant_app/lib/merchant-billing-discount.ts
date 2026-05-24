/**
 * Merchant bill: only restaurant-funded discounts count.
 * Platform offers are excluded from merchant totals.
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

export function merchantFundedAmountFromDiscountLine(
  row: Record<string, unknown>
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
    row.offerSource ?? row.offer_source ?? meta?.source ?? ""
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
  billing: Record<string, unknown> | null | undefined
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
