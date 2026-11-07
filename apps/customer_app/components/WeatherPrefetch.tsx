import { useLayoutEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";
import { isSameWeatherGrid } from "@/lib/weatherGrid";
import { startupInc, startupMeasure } from "@/lib/startupPerf";

/** Restore persisted weather + prefetch as soon as usable coords exist (not gated on address). */
export function WeatherPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const lastGridRef = useRef<{ lat: number; lng: number } | null>(null);

  useLayoutEffect(() => {
    if (!locationHydrated || !coords) return;
    // Deduplicate: only refetch when the weather grid changes — address labels must not retrigger.
    const prev = lastGridRef.current;
    if (
      prev &&
      isSameWeatherGrid(
        { latitude: prev.lat, longitude: prev.lng },
        { latitude: coords.latitude, longitude: coords.longitude }
      )
    ) {
      return;
    }
    lastGridRef.current = { lat: coords.latitude, lng: coords.longitude };
    startupInc("weather_requests");
    startupMeasure("weather_prefetch_start", "process_start");
    // Read latest address at call time — do not depend on address for triggering.
    const latestAddress = useLocationStore.getState().address ?? address;
    // Disk seed is sync inside restore; "done" marks seed+kickoff, not network finish.
    void restoreAndPrefetchLocationWeather(queryClient, latestAddress, coords)
      .then(() => {
        startupMeasure("weather_prefetch_seeded", "weather_prefetch_start");
      })
      .catch(() => {
        startupMeasure("weather_prefetch_seeded", "weather_prefetch_start");
      });
  }, [locationHydrated, coords?.latitude, coords?.longitude, queryClient]);

  return null;
}
