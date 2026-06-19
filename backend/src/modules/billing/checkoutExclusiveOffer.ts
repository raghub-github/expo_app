/**
 * Customer checkout: exactly ONE checkout promo at a time
 * (platform OR merchant OR billing coupon — never stacked with each other).
 * Membership subscription benefits (e.g. GMitra Plus free delivery) apply after
 * this step and stack with the single promo.
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
import { applyMerchantStoreOffers } from "./merchantOffersApply.js";
import {
  applyPlatformCartOffers,
  applyPlatformDeliveryOffers,
  applyPlatformFeeBucketOffers,
  estimateOfferDiscountValue,
  listEligiblePlatformOffersForCheckout,
  platformOfferConflictsWithSubscriptionFreeDelivery,
  qualifyingCartFromRem,
  resolveSelectedPlatformOfferForCheckout,
} from "./platformOffersApply.js";
import { merchantOfferEligibilityReason } from "./merchantOffersCheckout.js";

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
  const base = Math.max(0, rem.items);
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
  void ctx;
  return Math.max(0, amt);
}

function estimatePlatformOfferTotal(o: PlatformOfferRow, ctx: BillContext, rem: FeeRem): number {
  return estimateOfferDiscountValue(o, ctx, rem);
}

function resolveExclusiveWinner(
  ctx: BillContext,
  dataset: BillingDataset,
  itemPlusAddon: number,
  rem: FeeRem
): Winner {
  const grossCart = qualifyingCartFromRem(itemPlusAddon, rem);

  if (
    ctx.forceNoAutoOffer === true &&
    ctx.selectedPlatformOfferId == null &&
    (ctx.selectedMerchantOfferId == null || ctx.selectedMerchantOfferId <= 0) &&
    !(ctx.couponCode ?? "").trim()
  ) {
    return { kind: "none" };
  }

  const platformId = ctx.selectedPlatformOfferId;
  if (platformId != null) {
    const offer = resolveSelectedPlatformOfferForCheckout(ctx, dataset, grossCart, platformId);
    return offer ? { kind: "platform", offer } : { kind: "none" };
  }

  const merchantId = ctx.selectedMerchantOfferId;
  if (merchantId != null && merchantId > 0) {
    const offer = dataset.merchantOffers.find((o) => o.id === merchantId);
    if (offer && !merchantOfferEligibilityReason(offer, ctx, grossCart)) {
      return { kind: "merchant", offer };
    }
    return { kind: "none" };
  }

  const code = (ctx.couponCode ?? "").trim();
  if (code && dataset.coupon) {
    return { kind: "coupon", coupon: dataset.coupon };
  }

  /** Dataset coupon is pre-validated against `couponCode` at load time. */
  if (dataset.coupon) {
    return { kind: "coupon", coupon: dataset.coupon };
  }

  // Auto-pick: best single offer across platform + auto merchant (not coupon-without-code)
  let best: Winner = { kind: "none" };
  let bestAmt = 0;

  const platformEligible = listEligiblePlatformOffersForCheckout(ctx, dataset, grossCart);
  for (const o of platformEligible) {
    if (platformOfferConflictsWithSubscriptionFreeDelivery(ctx, o)) continue;
    const amt = estimatePlatformOfferTotal(o, ctx, rem);
    if (amt > bestAmt) {
      bestAmt = amt;
      best = { kind: "platform", offer: o };
    }
  }

  for (const offer of dataset.merchantOffers) {
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

/** Apply at most one checkout promo (customer-facing rule). */
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
      () => applyMerchantStoreOffers(ctx, dataset, state, itemPlusAddon, rem)
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
