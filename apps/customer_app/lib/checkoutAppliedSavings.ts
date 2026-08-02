/**
 * Single source of truth for checkout "You saved" amounts.
 * Only counts discounts actually present on the settled server bill (+ folded item deals).
 * Never includes advertised / unapplied membership upsell amounts.
 */

import { isSubscriptionBenefitDiscount, type CheckoutDiscountLike } from "@/lib/checkout-discount-display";

export function roundSavingsMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/**
 * Format applied savings for banners / headlines.
 * Never round ₹0.35 → "0" (Math.round / toFixed(0) did that and contradicted the bill).
 */
export function formatCheckoutSavingsRupees(amount: number): string {
  const n = roundSavingsMoney(amount);
  if (n < 0.005) return "0";
  if (Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n));
  return n.toFixed(2);
}

/**
 * Applied savings for banners / Total Bill strike / Bill Summary.
 * `billVisibleDiscounts` must already exclude item-surface Boost/BOGO rows that are
 * folded into Item total (those are passed via `itemDealSavings`).
 * Subscription free-delivery rows inside `billVisibleDiscounts` are counted once —
 * do not add them again separately.
 */
export function computeAppliedCheckoutSavings(args: {
  billVisibleDiscounts: CheckoutDiscountLike[];
  itemDealSavings: number;
}): number {
  const billSave = args.billVisibleDiscounts.reduce(
    (s, d) => s + (Number(d.amount) || 0),
    0
  );
  const itemSave = Math.max(0, Number(args.itemDealSavings) || 0);
  return roundSavingsMoney(billSave + itemSave);
}

/** True when the settled bill includes an applied GMitra Plus free-delivery benefit. */
export function hasAppliedMembershipFreeDelivery(
  discounts: CheckoutDiscountLike[] | null | undefined
): boolean {
  return (discounts ?? []).some(
    (d) => isSubscriptionBenefitDiscount(d) && (Number(d.amount) || 0) > 0.005
  );
}
