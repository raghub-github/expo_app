/**
 * Customer ride fare rules (no rider surges on customer bill).
 *
 * The Bike-Lite discount amount is now configurable via
 * `billing_pricing_rules` (charge_subtype `RIDE_BIKE_LITE_DISCOUNT`, seeded
 * in migration 0464). The constant below is the LEGACY fallback used when the
 * config row is missing or the DB lookup fails — it matches the value that
 * shipped for the last 8+ months so behaviour is identical if config is not
 * touched.
 */
export const BIKE_LITE_DISCOUNT_INR = 12;

/**
 * Apply the Bike-Lite discount to a customer's bike fare.
 * @param bikeFare Positive ₹ fare on regular bike.
 * @param discountOverride Optional runtime discount amount (₹) resolved from
 *   config. Falls back to `BIKE_LITE_DISCOUNT_INR` when not provided.
 */
export function applyBikeLiteCustomerFare(
  bikeFare: number,
  discountOverride?: number
): number {
  const discount =
    typeof discountOverride === "number" &&
    Number.isFinite(discountOverride) &&
    discountOverride > 0
      ? discountOverride
      : BIKE_LITE_DISCOUNT_INR;
  if (!Number.isFinite(bikeFare) || bikeFare <= discount) return bikeFare;
  return Math.round((bikeFare - discount) * 100) / 100;
}
