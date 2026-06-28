import { useLayoutEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";

/** Restore persisted weather + prefetch before home paints. */
export function WeatherPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);

  useLayoutEffect(() => {
    if (!locationHydrated || !coords) return;
    void restoreAndPrefetchLocationWeather(queryClient, address, coords);
  }, [
    locationHydrated,
    coords?.latitude,
    coords?.longitude,
    address?.city,
    address?.state,
    address?.fullAddress,
    address?.primary,
    address?.secondary,
    queryClient,
    address,
    coords,
  ]);

  return null;
}
