import { matchSavedAddressIdNearCoords } from "@/lib/deliveryDropResolution";
import type { Address } from "@/services/address.service";
import type { LocationSource } from "@/store/locationStore";

export type LatLng = { latitude: number; longitude: number };

/**
 * Canonical lat/lng for nearby merchant discovery (home list, search radius, offers).
 *
 * Priority:
 * 1. Explicit user-selected pin (optionally snapped to a saved address within 250m)
 * 2. Live GPS / current location coords
 *
 * Never uses server active-location or a default saved address — those caused
 * stale-city merchant lists after travel.
 */
export function resolveMerchantListingCoords(options: {
  locationSource: LocationSource | null;
  listingCoords: LatLng | null | undefined;
  addresses?: Address[];
}): LatLng | null {
  const { locationSource, listingCoords, addresses = [] } = options;
  if (listingCoords?.latitude == null || listingCoords.longitude == null) {
    return null;
  }

  if (locationSource === "selected" && addresses.length > 0) {
    const nearId = matchSavedAddressIdNearCoords(
      addresses,
      listingCoords.latitude,
      listingCoords.longitude,
      0.25
    );
    if (nearId != null) {
      const addr = addresses.find((a) => a.id === nearId);
      if (addr) {
        return { latitude: addr.latitude, longitude: addr.longitude };
      }
    }
  }

  return listingCoords;
}
