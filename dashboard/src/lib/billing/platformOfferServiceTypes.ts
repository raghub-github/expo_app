/** Platform offer `service_type` values — keep in sync with billing checkout `serviceType`. */
export const PLATFORM_OFFER_SERVICE_TYPES = ["FOOD", "GROCERY", "PARCEL", "RIDE", "ALL"] as const;

export type PlatformOfferServiceType = (typeof PLATFORM_OFFER_SERVICE_TYPES)[number];
