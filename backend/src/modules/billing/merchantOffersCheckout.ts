import type { BillContext, BillingDataset, MerchantOfferRow } from "./types.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function normalizeMenuId(v: unknown): string {
  return String(v ?? "").trim();
}

function timeEligible(offer: MerchantOfferRow, now: Date): boolean {
  if (offer.applicableOnDays && offer.applicableOnDays.length > 0) {
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const today = dayNames[now.getDay()];
    const allowed = offer.applicableOnDays.map((d) => d.toLowerCase().slice(0, 3));
    if (!allowed.includes(today)) return false;
  }
  if (offer.applicableTimeStart && offer.applicableTimeEnd) {
    const hhmm = now.toTimeString().slice(0, 5);
    if (hhmm < offer.applicableTimeStart || hhmm > offer.applicableTimeEnd) return false;
  }
  return true;
}

function segmentEligible(offer: MerchantOfferRow, ctx: BillContext): boolean {
  if (offer.firstOrderOnly || offer.newUserOnly) {
    if (ctx.userSegment !== "NEW") return false;
  }
  return true;
}

function usageCapExceeded(offer: MerchantOfferRow, ctx: BillContext): boolean {
  if (!offer.maxUsesPerUser || !ctx.merchantOfferUsagesByUser) return false;
  const used = ctx.merchantOfferUsagesByUser.get(offer.id) ?? 0;
  return used >= offer.maxUsesPerUser;
}

function eligibleSubtotal(ctx: BillContext, offer: MerchantOfferRow, grossCart: number): number {
  const meta = offer.metadata ?? {};
  const raw = meta.menu_item_ids ?? meta.menuItemIds;
  if (!Array.isArray(raw) || raw.length === 0) return grossCart;
  const allow = new Set(raw.map(normalizeMenuId));
  let sum = 0;
  for (const line of ctx.orderLines ?? []) {
    if (allow.has(normalizeMenuId(line.menuItemId))) sum += line.lineTotal;
  }
  return sum;
}

/** Customer-facing lock message (Zomato-style). */
export function formatMerchantOfferLockReason(
  offer: MerchantOfferRow,
  ctx: BillContext,
  grossCart: number,
  technicalReason: string
): string {
  const minOrder = num(offer.minOrderAmount);
  if (technicalReason.startsWith("min_order") && minOrder > 0) {
    const base = eligibleSubtotal(ctx, offer, grossCart);
    const gap = Math.max(0, minOrder - base);
    if (gap > 0.005) {
      const rounded = Math.ceil(gap);
      return `Add eligible items worth ₹${rounded} more to unlock`;
    }
    return `Minimum order value ₹${Math.round(minOrder)} required`;
  }
  if (technicalReason === "item_scope") {
    return "Add eligible items from this offer to unlock";
  }
  if (technicalReason === "usage_cap") {
    return "You have already used this offer";
  }
  if (technicalReason === "time_window") {
    return "Not available at this time";
  }
  if (technicalReason === "new_users_only") {
    return "For new customers only";
  }
  if (technicalReason === "coupon_code_required") {
    return offer.couponCode
      ? `Enter coupon code ${offer.couponCode} to apply`
      : "Enter coupon code at checkout to apply";
  }
  if (technicalReason === "manual_apply") {
    return "Tap APPLY when your cart is eligible";
  }
  return "Not eligible on this order";
}

export function merchantOfferEligibilityReason(
  offer: MerchantOfferRow,
  ctx: BillContext,
  grossCart: number
): string | null {
  if (usageCapExceeded(offer, ctx)) return "usage_cap";
  if (!timeEligible(offer, ctx.now)) return "time_window";
  if (!segmentEligible(offer, ctx)) return "new_users_only";

  const minOrder = num(offer.minOrderAmount);
  const qualifying = eligibleSubtotal(ctx, offer, grossCart);
  if (minOrder > 0 && qualifying < minOrder) return "min_order";

  const meta = offer.metadata ?? {};
  const rawIds = meta.menu_item_ids ?? meta.menuItemIds;
  if (Array.isArray(rawIds) && rawIds.length > 0) {
    const allow = new Set(rawIds.map(normalizeMenuId));
    const hasLine = (ctx.orderLines ?? []).some((l) => allow.has(normalizeMenuId(l.menuItemId)));
    if (!hasLine) return "item_scope";
  }

  const t = offer.offerType.toUpperCase();
  if (t === "COUPON") {
    const code = (offer.couponCode ?? "").trim();
    if (!code) return "coupon_code_required";
    const entered = (ctx.couponCode ?? "").trim().toUpperCase();
    if (!entered || entered !== code.toUpperCase()) return "coupon_code_required";
  }

  return null;
}

export function listMerchantOffersForCheckout(
  ctx: BillContext,
  dataset: BillingDataset,
  grossCart: number
): {
  eligible: MerchantOfferRow[];
  ineligible: Array<MerchantOfferRow & { reason: string; lockReason: string }>;
} {
  const eligible: MerchantOfferRow[] = [];
  const ineligible: Array<MerchantOfferRow & { reason: string; lockReason: string }> = [];

  for (const offer of dataset.merchantOffers) {
    const tech = merchantOfferEligibilityReason(offer, ctx, grossCart);
    // Listing-only: coupon offers are shown as applicable rows even before the
    // customer enters a code — actual apply still validates the code in billing.
    if (!tech || tech === "coupon_code_required") {
      eligible.push(offer);
      continue;
    }
    ineligible.push({
      ...offer,
      reason: tech,
      lockReason: formatMerchantOfferLockReason(offer, ctx, grossCart, tech),
    });
  }

  return { eligible, ineligible };
}
