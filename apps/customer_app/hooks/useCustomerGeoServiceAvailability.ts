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
    // Prefer live store coords immediately so geo/services does not wait on
    // addresses/active-location (often 1–3s) or fire with state=Current+location.
    const pin =
      servicePin ??
      (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)
        ? coords
        : null);
    const base = extractCustomerGeoHints(address, pin);
    return {
      ...base,
      lat: pin?.latitude ?? base.lat,
      lng: pin?.longitude ?? base.lng,
    };
  }, [address, servicePin, coords]);

  return useGeoServiceAvailability(hints);
}
