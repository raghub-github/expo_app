/** Parcel order search fields (orders_core + orders_parcel + customers + riders). */

export const PARCEL_SEARCH_TYPES = [
  "Order Id",
  "Internal Order Id",
  "Receiver Name",
  "Receiver Mobile",
  "Customer Mobile",
  "Rider Name",
  "Rider Mobile",
  "Rider Id",
] as const;

export type ParcelSearchType = (typeof PARCEL_SEARCH_TYPES)[number];

export function normalizeParcelSearchType(value: string | null | undefined): ParcelSearchType {
  if (value && (PARCEL_SEARCH_TYPES as readonly string[]).includes(value)) {
    return value as ParcelSearchType;
  }
  return "Order Id";
}
