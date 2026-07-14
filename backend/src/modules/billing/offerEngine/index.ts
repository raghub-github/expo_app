/**
 * Offer Engine v2 — single source of truth for promo eligibility + eligible subtotal.
 *
 * Money math (coupon / platform cart / precision merchant) MUST use eligibleSubtotal.
 * Membership benefits are applied separately and are not gated by eligibility.
 *
 * Frontend hints are display-only; billing never trusts client isDiscountEligible.
 */

export type IneligibilityReason = "ITEM_PROMO" | "MRP" | null;

export type {
  OrderLineForEligibility,
} from "../discountEligibility.js";

export {
  isItemSurfaceMerchantOffer,
  menuItemIdsWithItemSurfacePromo,
  markOrderLinesDiscountEligibility,
  promoEligibleSubtotal,
  cartPromoQualifyingSubtotal,
  eligibleSubtotal,
} from "../discountEligibility.js";
