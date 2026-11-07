/**
 * Pickup snap points for Person Ride / Parcel confirm-pickup maps.
 *
 * Production rule: only real, service-eligible backend records may appear as
 * green dots. There is currently no customer-facing pickup-point registry API
 * or table for Person Ride / Parcel booking maps, so this module returns an
 * empty list. Do not regenerate synthetic/random rings.
 */

export type PickupSnapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  /** Backend record id when a registry exists. */
  recordId?: string | number;
  name?: string;
  address?: string;
};

/**
 * Eligible nearby pickup points for the given service around an anchor.
 * Returns [] until a real backend source is wired — never fabricates markers.
 */
export function buildNearbyPickupSnaps(
  _latitude: number,
  _longitude: number,
  _count = 5,
  _service?: "person_ride" | "parcel"
): PickupSnapPoint[] {
  return [];
}

/** @deprecated Prefer buildNearbyPickupSnaps — kept for call-site clarity. */
export function fetchEligiblePickupSnaps(
  latitude: number,
  longitude: number,
  service: "person_ride" | "parcel" = "person_ride"
): PickupSnapPoint[] {
  return buildNearbyPickupSnaps(latitude, longitude, 0, service);
}
