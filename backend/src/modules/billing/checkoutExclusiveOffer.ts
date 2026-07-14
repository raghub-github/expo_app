/**
 * Customer checkout promos:
 * 1) Menu Boost / BOGO (item-surface) always apply when eligible — matches "Get for ₹" on menu.
 * 2) Exactly ONE cart-level promo (platform OR precision merchant OR coupon) — never stacked
 *    with each other. Auto-pick ONLY ever considers merchant Precision offers — Platform
 *    Offers never auto-apply, they are manual-selection-only (client must pass
 *    selectedPlatformOfferId explicitly). Membership benefits (e.g. GMitra Plus free
 *    delivery) apply after this.
 */

import type {
  BillContext,
  BillingDataset,
  DiscountRow,
  FeeRem,
  MerchantOfferRow,
  MutableBillState,
  PlatformOfferRow,
} from "./types.js";
import {
  applyCartSurfaceMerchantOffers,
  applyItemSurfaceMerchantOffers,
  applyMerchantStoreOffers,
  isItemSurfaceMerchantOffer,
} from "./merchantOffersApply.js";
import {
  applyPlatformCartOffers,
  applyPlatformDeliveryOffers,
  applyPlatformFeeBucketOffers,
  resolveSelectedPlatformOfferForCheckout,
} from "./platformOffersApply.js";
import { merchantOfferEligibilityReason } from "./merchantOffersCheckout.js";
import { cartPromoQualifyingSubtotal } from "./discountEligibility.js";

function merchantOfferConflictsWithSubscriptionFreeDelivery(
  ctx: BillContext,
  offer: MerchantOfferRow
): boolean {
  if (!ctx.customerSubscriptionFreeDeliveryEligible) return false;
  return offer.offerType.toUpperCase() === "FREE_DELIVERY";
}

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

type Winner =
  | { kind: "none" }
  | { kind: "platform"; offer: PlatformOfferRow }
  | { kind: "merchant"; offer: MerchantOfferRow }
  | { kind: "coupon"; coupon: DiscountRow };

function estimateMerchantOfferDiscount(
  offer: MerchantOfferRow,
  ctx: BillContext,
  grossCart: number,
  rem: FeeRem
): number {
  const t = offer.offerType.toUpperCase();
  if (t === "FREE_DELIVERY") return Math.max(0, rem.delivery);
  const base = Math.max(0, Math.min(rem.items, cartPromoQualifyingSubtotal(ctx, rem.items)));
  if (base <= 0) return 0;
  let amt = 0;
  if (t === "PERCENTAGE" || t === "CART_PERCENTAGE") {
    const pct = num(offer.discountPercentage);
    if (pct <= 0) return 0;
    amt = (base * pct) / 100;
  } else if (
    t === "FLAT" ||
    t === "CART_FLAT" ||
    t === "COUPON" ||
    t === "FREE_ITEM" ||
    t === "TIERED" ||
    t === "BUNDLE"
  ) {
    amt = num(offer.discountValue);
  }
  const cap = num(offer.maxDiscountAmount);
  if (cap > 0) amt = Math.min(amt, cap);
  const orderCap = num(offer.maxDiscountPerOrder);
  if (orderCap > 0) amt = Math.min(amt, orderCap);
  if (t !== "FREE_DELIVERY") amt = Math.min(amt, base);
  void grossCart;
  return Math.max(0, amt);
}

/**
 * Best eligible auto-applicable merchant offer by estimated discount value.
 * Never considers item-surface (Boost/BOGO) or COUPON-type offers — those are handled
 * elsewhere (item-surface always-on, coupon requires an explicit code).
 */
function bestEligibleMerchantOffer(
  ctx: BillContext,
  dataset: BillingDataset,
  grossCart: number,
  rem: FeeRem
): Winner {
  let best: Winner = { kind: "none" };
  let bestAmt = 0;
  for (const offer of dataset.merchantOffers) {
    if (isItemSurfaceMerchantOffer(offer)) continue;
    if (offer.autoApply === false) continue;
    const t = offer.offerType.toUpperCase();
    if (t === "COUPON") continue;
    if (merchantOfferConflictsWithSubscriptionFreeDelivery(ctx, offer)) continue;
    if (merchantOfferEligibilityReason(offer, ctx, grossCart)) continue;
    const amt = estimateMerchantOfferDiscount(offer, ctx, grossCart, rem);
    if (amt > bestAmt) {
      bestAmt = amt;
      best = { kind: "merchant", offer };
    }
  }
  return best;
}

function resolveExclusiveWinner(
  ctx: BillContext,
  dataset: BillingDataset,
  itemPlusAddon: number,
  rem: FeeRem
): Winner {
  // Cart / coupon / platform cart min-order + estimates use promo-eligible subtotal only.
  const grossCart = cartPromoQualifyingSubtotal(ctx, itemPlusAddon);

  if (
    ctx.forceNoAutoOffer === true &&
    ctx.selectedPlatformOfferId == null &&
    (ctx.selectedMerchantOfferId == null || ctx.selectedMerchantOfferId <= 0) &&
    !(ctx.couponCode ?? "").trim()
  ) {
    return { kind: "none" };
  }

  // Explicit platform pick is a manual user action — always honored regardless of
  // merchant-offer eligibility (platform never auto-applies, but a manual pick sticks).
  const platformId = ctx.selectedPlatformOfferId;
  if (platformId != null) {
    const offer = resolveSelectedPlatformOfferForCheckout(ctx, dataset, grossCart, platformId);
    return offer ? { kind: "platform", offer } : { kind: "none" };
  }

  const merchantId = ctx.selectedMerchantOfferId;
  if (merchantId != null && merchantId > 0) {
    const offer = dataset.merchantOffers.find((o) => o.id === merchantId);
    // Item-surface already applied separately — don't re-apply via exclusive.
    if (offer && isItemSurfaceMerchantOffer(offer)) {
      return { kind: "none" };
    }
    if (offer && !merchantOfferEligibilityReason(offer, ctx, grossCart)) {
      return { kind: "merchant", offer };
    }
    // The previously-applied merchant offer is no longer eligible (e.g. a borderline
    // min-order recompute) — re-auto-pick the next-best eligible merchant offer instead
    // of silently dropping the discount. Never falls back to platform (manual-only).
    return bestEligibleMerchantOffer(ctx, dataset, grossCart, rem);
  }

  const code = (ctx.couponCode ?? "").trim();
  if (code && dataset.coupon) {
    return { kind: "coupon", coupon: dataset.coupon };
  }

  /** Dataset coupon is pre-validated against `couponCode` at load time. */
  if (dataset.coupon) {
    return { kind: "coupon", coupon: dataset.coupon };
  }

  // Auto mode (nothing explicitly selected): merchant Precision only. Platform offers
  // are never auto-applied — they remain in the offer sheet for manual selection.
  return bestEligibleMerchantOffer(ctx, dataset, grossCart, rem);
}

function withScopedSelection<T>(
  ctx: BillContext,
  patch: Partial<Pick<BillContext, "selectedPlatformOfferId" | "selectedMerchantOfferId" | "forceNoAutoOffer">>,
  fn: () => T
): T {
  const prev = {
    selectedPlatformOfferId: ctx.selectedPlatformOfferId,
    selectedMerchantOfferId: ctx.selectedMerchantOfferId,
    forceNoAutoOffer: ctx.forceNoAutoOffer,
  };
  Object.assign(ctx, patch);
  try {
    return fn();
  } finally {
    Object.assign(ctx, prev);
  }
}

/** Apply item-surface Boost/BOGO, then at most one cart-level checkout promo. */
export function applyExclusiveCheckoutOffer(
  ctx: BillContext,
  dataset: BillingDataset,
  state: MutableBillState,
  itemPlusAddon: number,
  rem: FeeRem,
  applyCouponDiscount: (
    ctx: BillContext,
    coupon: DiscountRow,
    itemPlusAddon: number,
    state: MutableBillState,
    rem: FeeRem
  ) => void
): void {
  // 1) Menu Boost / BOGO — always when eligible (matches Get for ₹ on store page).
  // Never gate on selectedMerchantOfferId / forceNoAutoOffer — those are cart-surface only.
  // Otherwise picking Precision/coupon at checkout skips Boost and CTM freezes disc=0.
  withScopedSelection(
    ctx,
    { selectedMerchantOfferId: null, forceNoAutoOffer: false },
    () => applyItemSurfaceMerchantOffers(ctx, dataset, state, itemPlusAddon, rem)
  );

  // 2) One cart-level promo (platform Flat / precision merchant / coupon).
  const winner = resolveExclusiveWinner(ctx, dataset, itemPlusAddon, rem);
  if (winner.kind === "none") return;

  if (winner.kind === "coupon") {
    applyCouponDiscount(ctx, winner.coupon, itemPlusAddon, state, rem);
    return;
  }

  if (winner.kind === "merchant") {
    withScopedSelection(
      ctx,
      { selectedMerchantOfferId: winner.offer.id, selectedPlatformOfferId: null, forceNoAutoOffer: false },
      () => applyCartSurfaceMerchantOffers(ctx, dataset, state, itemPlusAddon, rem)
    );
    return;
  }

  withScopedSelection(
    ctx,
    { selectedPlatformOfferId: winner.offer.id, selectedMerchantOfferId: null, forceNoAutoOffer: false },
    () => {
      applyPlatformCartOffers(ctx, dataset, state, itemPlusAddon, rem);
      applyPlatformDeliveryOffers(ctx, dataset, state, itemPlusAddon, rem);
      applyPlatformFeeBucketOffers(ctx, dataset, state, itemPlusAddon, rem);
    }
  );
}

// Re-export for tests / partner paths that still call full merchant apply.
export { applyMerchantStoreOffers };
