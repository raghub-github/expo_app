export const RIDE_CATALOG_FARE_DISCOUNT_DEFAULT_INR = 5;

export const RIDE_CATALOG_FARE_DISCOUNT_DEFS = [
  {
    catalogCode: "bike-lite",
    parentCatalogCode: "bike",
    label: "Bike Lite",
    parentLabel: "Bike",
    subtype: "RIDE_BIKE_LITE_DISCOUNT",
  },
  {
    catalogCode: "ev_auto",
    parentCatalogCode: "auto",
    label: "EV Auto",
    parentLabel: "Auto",
    subtype: "RIDE_EV_AUTO_DISCOUNT",
  },
] as const;

export type RideCatalogFareDiscountRow = {
  catalogCode: string;
  parentCatalogCode: string;
  label: string;
  parentLabel: string;
  amountInr: number;
};
