import {
  matchSavedAddressIdNearCoords,
  resolveCheckoutDeliveryAddress,
} from "@/lib/deliveryDropResolution";
import type { Address } from "@/services/address.service";
import type { LocationSource } from "@/store/locationStore";

export type LatLng = { latitude: number; longitude: number };

/**
 * Canonical lat/lng for nearby merchant discovery (home list, search radius, offers).
 *
 * Same drop as checkout when a saved delivery address is resolved
 * (`resolveCheckoutDeliveryAddress`). Live GPS is only used when it is the
 * active delivery pin — never a far bound address after travel.
 */
export function resolveMerchantListingCoords(options: {
  locationSource: LocationSource | null;
  listingCoords: LatLng | null | undefined;
  addresses?: Address[];
  activeLocation?: {
    latitude: number | null;
    longitude: number | null;
    addressId?: number | null;
  } | null;
}): LatLng | null {
  const { locationSource, listingCoords, addresses = [], activeLocation } = options;
  if (listingCoords?.latitude == null || listingCoords.longitude == null) {
    return null;
  }

  const checkoutAddr = resolveCheckoutDeliveryAddress(
    addresses,
    listingCoords,
    locationSource,
    activeLocation
  );
  if (checkoutAddr) {
    return { latitude: checkoutAddr.latitude, longitude: checkoutAddr.longitude };
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
