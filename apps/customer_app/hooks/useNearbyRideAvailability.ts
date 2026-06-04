import { useQuery } from "@tanstack/react-query";
import { getRideAvailability } from "@/services/rideAvailability.service";

export function useNearbyRideAvailability(pickupLat: number | null, pickupLng: number | null) {
  const enabled = pickupLat != null && pickupLng != null && Number.isFinite(pickupLat) && Number.isFinite(pickupLng);

  return useQuery({
    queryKey: ["ride", "availability", pickupLat, pickupLng],
    queryFn: () =>
      getRideAvailability({
        pickupLat: pickupLat!,
        pickupLng: pickupLng!,
      }),
    enabled,
    refetchInterval: 12_000,
    staleTime: 8_000,
  });
}
