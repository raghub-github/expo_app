import type { RideAvailabilityOption } from "@/services/rideAvailability.service";

/** Ride types hidden from all customer booking UIs. */
export const HIDDEN_RIDE_CATALOG_IDS = new Set(["travel"]);

export function filterRideCatalogOptions(options: RideAvailabilityOption[]): RideAvailabilityOption[] {
  return options.filter((option) => !HIDDEN_RIDE_CATALOG_IDS.has(option.id));
}
