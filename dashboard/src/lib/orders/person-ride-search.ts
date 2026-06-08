/** Person ride order search fields (orders_core + orders_ride + customers + riders). */

export const PERSON_RIDE_SEARCH_TYPES = [
  "Order Id",
  "Internal Order Id",
  "Passenger Name",
  "Passenger Mobile",
  "Customer Mobile",
  "Rider Name",
  "Rider Mobile",
  "Rider Id",
] as const;

export type PersonRideSearchType = (typeof PERSON_RIDE_SEARCH_TYPES)[number];

export function normalizePersonRideSearchType(value: string | null | undefined): PersonRideSearchType {
  if (value && (PERSON_RIDE_SEARCH_TYPES as readonly string[]).includes(value)) {
    return value as PersonRideSearchType;
  }
  return "Order Id";
}
