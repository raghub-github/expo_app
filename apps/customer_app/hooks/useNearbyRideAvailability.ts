import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getRideAvailability } from "@/services/rideAvailability.service";

type PickupGeoHints = {
  pickupPincode?: string;
  pickupState?: string;
};

export function useNearbyRideAvailability(
  pickupLat: number | null,
  pickupLng: number | null,
  tripKm?: number | null,
  geoHints?: PickupGeoHints,
  rideType?: string | null
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
      rideType ?? null,
    ],
    queryFn: ({ signal }) =>
      getRideAvailability({
        pickupLat: pickupLat!,
        pickupLng: pickupLng!,
        tripKm: tripKmKey ?? undefined,
        pickupPincode: geoHints?.pickupPincode,
        pickupState: geoHints?.pickupState,
        rideType: rideType ?? undefined,
        signal,
      }),
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
    placeholderData: keepPreviousData,
    // Don't leave the book sheet stuck on a spinner if the API hangs.
    networkMode: "online",
  });
}
