/** Parse estimated savings (INR) from offer/coupon copy for promo UI. */
export function estimateOfferSavings(
  description: string,
  cartSubtotal: number,
  discountType?: string | null
): number | null {
  const text = (description ?? "").trim();
  if (!text) return null;

  const fixed = text.match(/₹\s*(\d+(?:\.\d+)?)\s*off/i);
  if (fixed) {
    const n = parseFloat(fixed[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const pct =
    text.match(/(\d+(?:\.\d+)?)\s*%\s*off/i) ??
    (String(discountType ?? "").toUpperCase() === "PERCENTAGE"
      ? text.match(/(\d+(?:\.\d+)?)\s*%/)
      : null);
  if (pct && cartSubtotal > 0) {
    const pctVal = parseFloat(pct[1]);
    if (!Number.isFinite(pctVal) || pctVal <= 0) return null;
    let saving = (cartSubtotal * pctVal) / 100;
    const maxCap = text.match(/max\s*₹\s*(\d+(?:\.\d+)?)/i);
    if (maxCap) {
      const cap = parseFloat(maxCap[1]);
      if (Number.isFinite(cap) && cap > 0) saving = Math.min(saving, cap);
    }
    return Math.round(saving);
  }

  return null;
}
