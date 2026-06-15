import { useMemo } from "react";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { useGeoServiceAvailability } from "@/hooks/useGeoServiceAvailability";

/** Geo FOOD / PARCEL / RIDE toggles for the customer's current location. */
export function useCustomerGeoServiceAvailability() {
  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const debouncedCoords = useDebouncedCoords(coords);

  const hints = useMemo(
    () => extractCustomerGeoHints(address, debouncedCoords),
    [address, debouncedCoords]
  );

  return useGeoServiceAvailability(hints);
}
