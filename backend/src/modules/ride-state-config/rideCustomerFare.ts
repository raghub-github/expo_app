/**
 * Customer ride fare rules (no rider surges on customer bill).
 *
 * Catalog fare offsets (Bike Lite vs Bike, EV Auto vs Auto) are configurable
 * via `billing_pricing_rules`. The constant below is the fallback when the
 * config row is missing — default ₹5.
 */
export const CATALOG_FARE_OFFSET_FALLBACK_INR = 5;

/** @deprecated Use `CATALOG_FARE_OFFSET_FALLBACK_INR`. */
export const BIKE_LITE_DISCOUNT_INR = CATALOG_FARE_OFFSET_FALLBACK_INR;

/**
 * Subtract a catalog offset from the parent fare (Bike Lite / EV Auto).
 * Platform offers apply on the result, not on the parent fare.
 */
export function applyCatalogOffsetCustomerFare(
  parentFare: number,
  discountOverride?: number
): number {
  const discount =
    typeof discountOverride === "number" &&
    Number.isFinite(discountOverride) &&
    discountOverride > 0
      ? discountOverride
      : CATALOG_FARE_OFFSET_FALLBACK_INR;
  if (!Number.isFinite(parentFare) || parentFare <= discount) return parentFare;
  return Math.round((parentFare - discount) * 100) / 100;
}

/** Apply the Bike-Lite discount to a customer's bike fare. */
export function applyBikeLiteCustomerFare(
  bikeFare: number,
  discountOverride?: number
): number {
  return applyCatalogOffsetCustomerFare(bikeFare, discountOverride);
}
