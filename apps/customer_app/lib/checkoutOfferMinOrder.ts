/**
 * Shared min-order eligibility for checkout coupons / platform offers.
 * Prefer explicit min fields; fall back to "Min order ₹X" in summary/description.
 */

export function parseMinOrderFromText(
  ...texts: Array<string | null | undefined>
): number | null {
  for (const text of texts) {
    const raw = String(text ?? "");
    if (!raw.trim()) continue;
    const m = raw.match(/min(?:imum)?\s*order\s*₹?\s*(\d+(?:\.\d+)?)/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function resolveOfferMinOrderAmount(args: {
  minOrderAmount?: number | null;
  minCartAmount?: number | null;
  summary?: string | null;
  description?: string | null;
  reason?: string | null;
  lockReason?: string | null;
}): number | null {
  const explicit = args.minOrderAmount ?? args.minCartAmount;
  if (explicit != null && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return parseMinOrderFromText(
    args.summary,
    args.description,
    args.reason,
    args.lockReason
  );
}

/** ₹ still needed to reach min order; 0 = eligible on min-order rule. */
export function resolveOfferMinOrderGap(
  args: {
    minOrderAmount?: number | null;
    minCartAmount?: number | null;
    summary?: string | null;
    description?: string | null;
    reason?: string | null;
    lockReason?: string | null;
  },
  cartSubtotal: number
): number {
  const min = resolveOfferMinOrderAmount(args);
  if (min == null || !(min > 0)) return 0;
  const cart = Number.isFinite(cartSubtotal) ? cartSubtotal : 0;
  return Math.ceil(Math.max(0, min - cart));
}

export function formatMinOrderLockReason(gapInr: number, minOrderAmount: number): string {
  const gap = Math.ceil(Math.max(0, gapInr));
  const min = Math.round(minOrderAmount);
  if (!(gap > 0)) return "";
  return `Add ₹${gap} more to use this offer (min order ₹${min}).`;
}
