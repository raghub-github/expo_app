/** Subscription perks (e.g. GMitra Plus free delivery) — stack separately from checkout coupons. */

export type CheckoutDiscountLike = {
  meta?: Record<string, unknown> | null;
  label?: string;
  amount?: number;
  hidden?: boolean;
};

/**
 * Customer-facing discount names — show the merchant's actual configured offer
 * title (as it appears in the offers sheet) rather than a generic placeholder.
 */
export function friendlyCheckoutDiscountLabel(label: string | null | undefined): string {
  const raw = String(label ?? "").trim();
  if (!raw) return "Store offer";
  // Platform delivery lines historically used "Delivery discount · {name}".
  const stripped = raw.replace(/^Delivery discount\s*[·•\-–—]\s*/i, "").trim();
  return stripped || raw;
}

export function isSubscriptionBenefitDiscount(d: CheckoutDiscountLike): boolean {
  const source = d.meta?.source;
  return (
    source === "customer_subscription_free_delivery" ||
    source === "customer_subscription_delivery_waived_marker"
  );
}

export function isCheckoutPromoDiscount(d: CheckoutDiscountLike): boolean {
  if (d.hidden) return false;
  if ((d.amount ?? 0) <= 0.005) return false;
  return !isSubscriptionBenefitDiscount(d);
}

export function splitCheckoutDiscounts<T extends CheckoutDiscountLike>(
  discounts: T[] | null | undefined
): {
  subscriptionBenefits: T[];
  checkoutPromos: T[];
} {
  const visible = (discounts ?? []).filter((d) => !d.hidden);
  return {
    subscriptionBenefits: visible.filter(isSubscriptionBenefitDiscount),
    checkoutPromos: visible.filter(isCheckoutPromoDiscount),
  };
}
