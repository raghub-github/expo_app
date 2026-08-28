/** Platform offer `service_type` values — keep in sync with billing checkout `serviceType`. */
export const PLATFORM_OFFER_SERVICE_TYPES = ["FOOD", "GROCERY", "PARCEL", "RIDE", "ALL"] as const;

export type PlatformOfferServiceType = (typeof PLATFORM_OFFER_SERVICE_TYPES)[number];

/** Checkout verticals (customer passes one of these; never `ALL`). */
export const PLATFORM_OFFER_CHECKOUT_SERVICE_TYPES = ["FOOD", "GROCERY", "PARCEL", "RIDE"] as const;

export type PlatformOfferCheckoutServiceType = (typeof PLATFORM_OFFER_CHECKOUT_SERVICE_TYPES)[number];

export function platformOfferServiceMatches(
  checkoutServiceType: string | null | undefined,
  offerServiceType: string | null | undefined
): boolean {
  const st = (checkoutServiceType ?? "FOOD").trim().toUpperCase();
  const oSt = (offerServiceType ?? "FOOD").trim().toUpperCase();
  return oSt === st || oSt === "ALL";
}
