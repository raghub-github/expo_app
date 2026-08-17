import { useMemo } from "react";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { useGeoServiceAvailability } from "@/hooks/useGeoServiceAvailability";

/**
 * Geo FOOD / PARCEL / RIDE coverage for the customer's **service location pin**.
 * Uses the same lat/lng resolution as merchant listing / Prevent check so
 * coverage and emergency blocks stay aligned. Selected delivery address wins;
 * GPS is only used when it is the active delivery pin.
 */
export function useCustomerGeoServiceAvailability() {
  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const debouncedCoords = useDebouncedCoords(coords);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();

  const listingCoords = locationSource === "selected" ? coords : debouncedCoords;
  const servicePin = useMemo(
    () =>
      resolveMerchantListingCoords({
        locationSource,
        listingCoords,
        addresses,
        activeLocation,
      }),
    [locationSource, listingCoords, addresses, activeLocation]
  );

  const hints = useMemo(() => {
    const base = extractCustomerGeoHints(address, servicePin);
    // Prefer precise coords for Prevent merge — never decide by pincode alone
    // when we have a service pin.
    return {
      ...base,
      lat: servicePin?.latitude ?? base.lat,
      lng: servicePin?.longitude ?? base.lng,
    };
  }, [address, servicePin]);

  return useGeoServiceAvailability(hints);
}
