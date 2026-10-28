/**
 * Customer-facing platform offer titles — shared by checkout-offers listing and
 * bill discount labels so Bill Summary matches the offers sheet.
 */

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** "Flat 100 off" → "Flat ₹100 Off"; leave % / ₹ titles alone. */
export function normalizeFlatAmountOfferTitle(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  if (/%/.test(raw) || /₹/.test(raw)) {
    return raw.replace(/\s+/g, " ");
  }
  const m = raw.match(/^flat\s+(\d+)\s*(?:rs\.?|inr)?\s*off?$/i);
  if (m) return `Flat ₹${m[1]} Off`;
  const m2 = raw.match(/^(\d+)\s*(?:rs\.?|inr)?\s*off$/i);
  if (m2) return `Flat ₹${m2[1]} Off`;
  return raw;
}

export type PlatformOfferDisplayInput = {
  name: string | null;
  offerKind?: string | null;
  discountType: string | null;
  valueNumeric: number | null;
  maxDiscountAmount: number | null;
};

/**
 * Checkout / Bill Summary title for a platform offer.
 * FREE_DELIVERY always uses the configured Offer name (never leftover FIXED/% cart fields).
 */
export function platformOfferCheckoutDisplayName(o: PlatformOfferDisplayInput): string {
  const kind = String(o.offerKind ?? "").toUpperCase();
  if (kind === "FREE_DELIVERY") {
    return normalizeFlatAmountOfferTitle(o.name) || "Free Delivery";
  }
  if (kind === "FLASH_SALE") {
    return normalizeFlatAmountOfferTitle(o.name) || "Flash Sale";
  }

  const dt = String(o.discountType ?? "").toUpperCase();
  const v = num(o.valueNumeric);
  if (dt === "FIXED" && v > 0) {
    return `Flat ₹${Math.round(v)} Off`;
  }
  if (dt === "PERCENTAGE" && v > 0) {
    const cap = num(o.maxDiscountAmount);
    if (cap > 0) return `Flat ${Math.round(v)}% Off up to ₹${Math.round(cap)}`;
    return `Flat ${Math.round(v)}% Off`;
  }
  return normalizeFlatAmountOfferTitle(o.name) || "Platform offer";
}
