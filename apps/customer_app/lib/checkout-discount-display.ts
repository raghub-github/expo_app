/** Subscription perks (e.g. GMitra Plus free delivery) — stack separately from checkout coupons. */

export type CheckoutDiscountLike = {
  meta?: Record<string, unknown> | null;
  label?: string;
  amount?: number;
  hidden?: boolean;
};

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
