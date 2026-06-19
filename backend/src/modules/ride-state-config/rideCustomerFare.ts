/** Customer ride fare rules (no rider surges on customer bill). */
export const BIKE_LITE_DISCOUNT_INR = 12;

export function applyBikeLiteCustomerFare(bikeFare: number): number {
  if (!Number.isFinite(bikeFare) || bikeFare <= BIKE_LITE_DISCOUNT_INR) return bikeFare;
  return Math.round((bikeFare - BIKE_LITE_DISCOUNT_INR) * 100) / 100;
}
