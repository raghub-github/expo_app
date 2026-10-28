/** Subscription perks (e.g. GMitra Plus free delivery) — stack separately from checkout coupons. */

export type CheckoutDiscountLike = {
  meta?: Record<string, unknown> | null;
  label?: string;
  amount?: number;
  hidden?: boolean;
};

/** Minimal offer catalog shape used to resolve bill-summary labels. */
export type CheckoutOfferCatalog = {
  coupons?: Array<{ code: string; description?: string | null }> | null;
  merchantOffers?: Array<{
    id: number;
    title: string;
    requiresCouponCode?: string | null;
  }> | null;
  merchantOffersIneligible?: Array<{
    id: number;
    title: string;
    requiresCouponCode?: string | null;
  }> | null;
  platformOffers?: Array<{
    id: number;
    name: string | null;
    couponCode?: string | null;
  }> | null;
  platformOffersIneligible?: Array<{
    id: number;
    name: string | null;
    couponCode?: string | null;
  }> | null;
};

/**
 * Customer-facing discount names — show the merchant's actual configured offer
 * title (as it appears in the offers sheet) rather than a generic placeholder.
 */
export function friendlyCheckoutDiscountLabel(label: string | null | undefined): string {
  const raw = String(label ?? "").trim();
  if (!raw) return "Store offer";
  // Platform delivery lines historically used "Delivery discount · {name}".
  const stripped = raw
    .replace(/^Delivery discount\s*[·•\-–—]\s*/i, "")
    .replace(/^Coupon\s+/i, "")
    .trim();
  return stripped || raw;
}

function normCode(v: string | null | undefined): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Prefer the live offers-sheet title/name over billing pipeline labels like
 * `Coupon FLAT35OFF` or generic delivery placeholders.
 */
export function resolveCheckoutDiscountDisplayLabel(
  discount: CheckoutDiscountLike,
  catalog?: CheckoutOfferCatalog | null
): string {
  const meta = discount.meta ?? null;
  const platformId = meta?.platformOfferId;
  if (typeof platformId === "number" && platformId > 0 && catalog) {
    const hit =
      catalog.platformOffers?.find((o) => o.id === platformId) ??
      catalog.platformOffersIneligible?.find((o) => o.id === platformId);
    const name = String(hit?.name ?? "").trim();
    if (name) return name;
  }

  const merchantId = meta?.merchantOfferId;
  if (typeof merchantId === "number" && merchantId > 0 && catalog) {
    const hit =
      catalog.merchantOffers?.find((o) => o.id === merchantId) ??
      catalog.merchantOffersIneligible?.find((o) => o.id === merchantId);
    const title = String(hit?.title ?? "").trim();
    if (title) return title;
  }

  const codeFromMeta =
    typeof meta?.code === "string"
      ? meta.code
      : typeof meta?.couponCode === "string"
        ? meta.couponCode
        : null;
  const labelCode = String(discount.label ?? "")
    .replace(/^Coupon\s+/i, "")
    .trim();
  const code = normCode(codeFromMeta) || normCode(labelCode);

  if (code && catalog) {
    const platformHit =
      catalog.platformOffers?.find((o) => normCode(o.couponCode) === code) ??
      catalog.platformOffersIneligible?.find((o) => normCode(o.couponCode) === code);
    const platformName = String(platformHit?.name ?? "").trim();
    if (platformName) return platformName;

    const merchantHit =
      catalog.merchantOffers?.find((o) => normCode(o.requiresCouponCode) === code) ??
      catalog.merchantOffersIneligible?.find((o) => normCode(o.requiresCouponCode) === code);
    const merchantTitle = String(merchantHit?.title ?? "").trim();
    if (merchantTitle) return merchantTitle;

    const couponHit = catalog.coupons?.find((c) => normCode(c.code) === code);
    const couponDesc = String(couponHit?.description ?? "").trim();
    if (couponDesc) return couponDesc;
  }

  return friendlyCheckoutDiscountLabel(discount.label);
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
  if (d.meta?.doesNotReducePayable === true || d.meta?.flashSale === true) return false;
  return !isSubscriptionBenefitDiscount(d);
}

/** Platform FLASH_SALE subsidy — already folded into Item total (hidden / doesNotReducePayable). */
export function isFlashSaleDiscount(d: CheckoutDiscountLike): boolean {
  if ((d.amount ?? 0) <= 0.005) return false;
  if (d.meta?.flashSale === true) return true;
  return String(d.meta?.offerKind ?? "").toUpperCase() === "FLASH_SALE";
}

export function extractFlashSaleDiscounts<T extends CheckoutDiscountLike>(
  discounts: T[] | null | undefined
): T[] {
  return (discounts ?? []).filter(isFlashSaleDiscount);
}

export function flashSaleSavingsByOfferId(
  discounts: CheckoutDiscountLike[] | null | undefined
): Record<number, number> {
  const map: Record<number, number> = {};
  for (const d of extractFlashSaleDiscounts(discounts)) {
    const id = d.meta?.platformOfferId;
    if (typeof id !== "number" || !(id > 0)) continue;
    map[id] = (map[id] ?? 0) + (Number(d.amount) || 0);
  }
  return map;
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
