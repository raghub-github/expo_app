/**
 * Customer checkout promos:
 * 1) Menu Boost / BOGO (item-surface) always apply when eligible — matches "Get for ₹" on menu.
 * 2) Exactly ONE cart-level promo (platform OR precision merchant OR coupon) — never stacked
 *    with each other. Auto-pick considers merchant Precision offers, coupons flagged
 *    `auto_apply`, AND platform offers with `promo_config.auto_apply === true` (best estimated
 *    savings wins). Platform offers without auto_apply stay manual (client must pass
 *    selectedPlatformOfferId). Membership benefits (e.g. GMitra Plus free delivery) apply after.
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
  estimateOfferDiscountValue,
  listEligiblePlatformOffersForCheckout,
  platformOfferConflictsWithSubscriptionFreeDelivery,
  platformOfferCheckoutAutoApply,
  resolveSelectedPlatformOfferForCheckout,
} from "./platformOffersApply.js";
import { merchantOfferEligibilityReason } from "./merchantOffersCheckout.js";
import { cartPromoQualifyingSubtotal } from "./discountEligibility.js";
import { estimateCheckoutCouponDiscountInr } from "./checkoutCouponEligibility.js";

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
 * elsewhere (item-surface always-on; coupons via autoApplyCoupons / explicit code).
 */
function bestEligibleMerchantOffer(
  ctx: BillContext,
  dataset: BillingDataset,
  grossCart: number,
  rem: FeeRem
): { winner: Winner; amount: number } {
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
  return { winner: best, amount: bestAmt };
}

/**
 * Best fully-eligible auto_apply coupon preloaded on the dataset (customer-filtered).
 */
function bestEligibleAutoCoupon(
  ctx: BillContext,
  dataset: BillingDataset,
  rem: FeeRem
): { winner: Winner; amount: number } {
  const geoBound = ctx.checkoutCouponGeoBindingEffectiveIds;
  const eligibleBase = cartPromoQualifyingSubtotal(ctx, Math.max(0, rem.items));
  let best: Winner = { kind: "none" };
  let bestAmt = 0;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const coupon of dataset.autoApplyCoupons ?? []) {
    if (!geoBound || !geoBound.has(coupon.id)) continue;
    const amt = estimateCheckoutCouponDiscountInr(coupon, eligibleBase);
    if (amt <= 0) continue;
    const priority = Number(
      (coupon.couponConfig as { priority?: number } | null)?.priority ?? 100
    );
    const p = Number.isFinite(priority) ? priority : 100;
    // Prefer higher savings; on tie, lower priority number wins (dashboard convention).
    if (amt > bestAmt || (amt === bestAmt && p < bestPriority)) {
      bestAmt = amt;
      bestPriority = p;
      best = { kind: "coupon", coupon };
    }
  }
  return { winner: best, amount: bestAmt };
}

/**
 * Best Food platform offer with promo_config.auto_apply === true (estimated savings).
 * Manual-only platform offers are excluded — customer must pass selectedPlatformOfferId.
 */
function isPlatformDeliveryReliefOffer(offer: PlatformOfferRow): boolean {
  const k = String(offer.offerKind ?? "").toUpperCase();
  if (k === "FREE_DELIVERY") return true;
  return Boolean(String(offer.deliveryDiscountType ?? "").trim());
}

function bestEligibleAutoPlatformOffer(
  ctx: BillContext,
  dataset: BillingDataset,
  grossCart: number,
  rem: FeeRem
): { winner: Winner; amount: number } {
  let best: Winner = { kind: "none" };
  let bestAmt = 0;
  for (const offer of listEligiblePlatformOffersForCheckout(ctx, dataset, grossCart)) {
    if (!platformOfferCheckoutAutoApply(offer)) continue;
    if (platformOfferConflictsWithSubscriptionFreeDelivery(ctx, offer)) continue;
    // Delivery relief is applied after the cart exclusive winner — do not let
    // FREE_DELIVERY displace FLAT/PERCENT cart promos in the exclusive race.
    if (isPlatformDeliveryReliefOffer(offer)) continue;
    const amt = estimateOfferDiscountValue(offer, ctx, rem);
    if (amt > bestAmt) {
      bestAmt = amt;
      best = { kind: "platform", offer };
    }
  }
  return { winner: best, amount: bestAmt };
}

function bestAutoExclusiveWinner(
  ctx: BillContext,
  dataset: BillingDataset,
  /** Full items+addons — platform FREE_DELIVERY min-order uses this. */
  itemPlusAddon: number,
  rem: FeeRem
): Winner {
  const eligibleCart = cartPromoQualifyingSubtotal(ctx, itemPlusAddon);
  const merchant = bestEligibleMerchantOffer(ctx, dataset, eligibleCart, rem);
  const coupon = bestEligibleAutoCoupon(ctx, dataset, rem);
  const platform = bestEligibleAutoPlatformOffer(ctx, dataset, itemPlusAddon, rem);

  type Cand = { winner: Winner; amount: number; tieBreak: number };
  const cands: Cand[] = [
    { winner: merchant.winner, amount: merchant.amount, tieBreak: 2 },
    { winner: coupon.winner, amount: coupon.amount, tieBreak: 1 },
    { winner: platform.winner, amount: platform.amount, tieBreak: 3 },
  ].filter((c) => c.amount > 0 && c.winner.kind !== "none");

  if (cands.length === 0) return { kind: "none" };
  cands.sort((a, b) => b.amount - a.amount || a.tieBreak - b.tieBreak);
  return cands[0]!.winner;
}

function resolveExclusiveWinner(
  ctx: BillContext,
  dataset: BillingDataset,
  itemPlusAddon: number,
  rem: FeeRem
): Winner {
  // Merchant / coupon cart min-order + estimates use promo-eligible subtotal.
  const eligibleCart = cartPromoQualifyingSubtotal(ctx, itemPlusAddon);

  if (
    ctx.forceNoAutoOffer === true &&
    ctx.selectedPlatformOfferId == null &&
    (ctx.selectedMerchantOfferId == null || ctx.selectedMerchantOfferId <= 0) &&
    !(ctx.couponCode ?? "").trim()
  ) {
    return { kind: "none" };
  }

  // Explicit platform pick is a manual user action — always honored regardless of
  // merchant-offer eligibility (manual pick sticks even when auto_apply is OFF).
  // Pass full itemPlusAddon so FREE_DELIVERY min-order is not killed by Boost lines.
  const platformId = ctx.selectedPlatformOfferId;
  if (platformId != null) {
    const offer = resolveSelectedPlatformOfferForCheckout(ctx, dataset, itemPlusAddon, platformId);
    return offer ? { kind: "platform", offer } : { kind: "none" };
  }

  const merchantId = ctx.selectedMerchantOfferId;
  if (merchantId != null && merchantId > 0) {
    const offer = dataset.merchantOffers.find((o) => o.id === merchantId);
    // Item-surface already applied separately — don't re-apply via exclusive.
    if (offer && isItemSurfaceMerchantOffer(offer)) {
      return { kind: "none" };
    }
    if (offer && !merchantOfferEligibilityReason(offer, ctx, eligibleCart)) {
      return { kind: "merchant", offer };
    }
    // The previously-applied merchant offer is no longer eligible (e.g. a borderline
    // min-order recompute) — re-auto-pick the next-best eligible merchant offer instead
    // of silently dropping the discount. Prefer merchant re-pick (store offer behaviour).
    return bestEligibleMerchantOffer(ctx, dataset, eligibleCart, rem).winner;
  }

  const code = (ctx.couponCode ?? "").trim();
  if (code && dataset.coupon) {
    return { kind: "coupon", coupon: dataset.coupon };
  }

  /** Dataset coupon is pre-validated against `couponCode` at load time. */
  if (dataset.coupon) {
    return { kind: "coupon", coupon: dataset.coupon };
  }

  // Auto mode: best of merchant Precision + auto_apply coupons + auto_apply platform offers.
  // Pass full items+addons so FREE_DELIVERY min-order uses the real cart.
  return bestAutoExclusiveWinner(ctx, dataset, itemPlusAddon, rem);
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
  // FREE_DELIVERY is delivery-fee relief — it may coexist with a cart discount
  // unless the cart winner is itself a delivery waiver / conflicts with subscription FD.
  const winner = resolveExclusiveWinner(ctx, dataset, itemPlusAddon, rem);

  const applyDeliveryRelief = () => {
    if (ctx.customerSubscriptionFreeDeliveryEligible) return;
    const pinnedDelivery =
      winner.kind === "platform" && isPlatformDeliveryReliefOffer(winner.offer)
        ? winner.offer.id
        : null;
    // Respect forceNoAutoOffer for auto delivery unless the exclusive winner is delivery itself.
    if (ctx.forceNoAutoOffer === true && pinnedDelivery == null) return;
    // Clear cart selection so delivery bucket can auto-pick FREE_DELIVERY
    // independently of the cart exclusive winner (e.g. FLAT 35 OFF).
    withScopedSelection(
      ctx,
      {
        selectedPlatformOfferId: pinnedDelivery,
        selectedMerchantOfferId: null,
        forceNoAutoOffer: false,
      },
      () => {
        applyPlatformDeliveryOffers(ctx, dataset, state, itemPlusAddon, rem);
        applyPlatformFeeBucketOffers(ctx, dataset, state, itemPlusAddon, rem);
      }
    );
  };

  if (winner.kind === "none") {
    applyDeliveryRelief();
    return;
  }

  if (winner.kind === "coupon") {
    applyCouponDiscount(ctx, winner.coupon, itemPlusAddon, state, rem);
    applyDeliveryRelief();
    return;
  }

  if (winner.kind === "merchant") {
    // Merchant FREE_DELIVERY already waives delivery — don't double-apply platform FD.
    const merchantIsDelivery =
      String(winner.offer.offerType ?? "").toUpperCase() === "FREE_DELIVERY";
    withScopedSelection(
      ctx,
      { selectedMerchantOfferId: winner.offer.id, selectedPlatformOfferId: null, forceNoAutoOffer: false },
      () => applyCartSurfaceMerchantOffers(ctx, dataset, state, itemPlusAddon, rem)
    );
    if (!merchantIsDelivery) applyDeliveryRelief();
    return;
  }

  // Platform cart winner (DISCOUNT / FLAT / FREE_DELIVERY / …)
  const platformIsDelivery =
    String(winner.offer.offerKind ?? "").toUpperCase() === "FREE_DELIVERY" ||
    Boolean(String(winner.offer.deliveryDiscountType ?? "").trim());

  withScopedSelection(
    ctx,
    { selectedPlatformOfferId: winner.offer.id, selectedMerchantOfferId: null, forceNoAutoOffer: false },
    () => {
      applyPlatformCartOffers(ctx, dataset, state, itemPlusAddon, rem);
    }
  );
  if (platformIsDelivery) {
    withScopedSelection(
      ctx,
      { selectedPlatformOfferId: winner.offer.id, selectedMerchantOfferId: null, forceNoAutoOffer: false },
      () => {
        applyPlatformDeliveryOffers(ctx, dataset, state, itemPlusAddon, rem);
        applyPlatformFeeBucketOffers(ctx, dataset, state, itemPlusAddon, rem);
      }
    );
  } else {
    applyDeliveryRelief();
  }
}

// Re-export for tests / partner paths that still call full merchant apply.
export { applyMerchantStoreOffers };
