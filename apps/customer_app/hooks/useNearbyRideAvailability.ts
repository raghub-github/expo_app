import { useQuery } from "@tanstack/react-query";
import { getRideAvailability } from "@/services/rideAvailability.service";

type PickupGeoHints = {
  pickupPincode?: string;
  pickupState?: string;
};

export function useNearbyRideAvailability(
  pickupLat: number | null,
  pickupLng: number | null,
  tripKm?: number | null,
  geoHints?: PickupGeoHints
) {
  const enabled =
    pickupLat != null &&
    pickupLng != null &&
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLng);

  const tripKmKey =
    tripKm != null && Number.isFinite(tripKm) && tripKm > 0 ? tripKm : null;

  return useQuery({
    queryKey: [
      "ride",
      "availability",
      pickupLat,
      pickupLng,
      tripKmKey,
      geoHints?.pickupPincode ?? null,
      geoHints?.pickupState ?? null,
    ],
    queryFn: () =>
      getRideAvailability({
        pickupLat: pickupLat!,
        pickupLng: pickupLng!,
        tripKm: tripKmKey ?? undefined,
        pickupPincode: geoHints?.pickupPincode,
        pickupState: geoHints?.pickupState,
      }),
    enabled,
    refetchInterval: 12_000,
    staleTime: 8_000,
  });
}
