import type { RideAvailabilityOption } from "@/services/rideAvailability.service";

/** Ride types hidden from all customer booking UIs. */
export const HIDDEN_RIDE_CATALOG_IDS = new Set(["travel"]);

/** Book-a-ride / All Services display order. */
export const RIDE_CATALOG_DISPLAY_ORDER = [
  "bike",
  "bike-lite",
  "auto",
  "ev_auto",
  "cab-economy",
  "cab-premium",
] as const;

export function filterRideCatalogOptions(options: RideAvailabilityOption[]): RideAvailabilityOption[] {
  return options.filter((option) => !HIDDEN_RIDE_CATALOG_IDS.has(option.id));
}

export function sortRideCatalogOptions<T extends { id: string }>(options: T[]): T[] {
  const rank = (id: string) => {
    const i = (RIDE_CATALOG_DISPLAY_ORDER as readonly string[]).indexOf(id);
    return i < 0 ? 1000 : i;
  };
  return [...options].sort((a, b) => rank(a.id) - rank(b.id));
}

/** EV Auto uses the Auto EV CMS slot (customer.ride.travel). */
export function catalogOptionImageKey(id: string, imageKey?: string | null): string {
  if (id === "ev_auto") return "ev_auto";
  const key = imageKey?.trim();
  return key || id;
}
