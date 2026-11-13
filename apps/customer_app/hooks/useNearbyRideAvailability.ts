import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getRideAvailability } from "@/services/rideAvailability.service";

type PickupGeoHints = {
  pickupPincode?: string;
  pickupState?: string;
  /** Duty filter — person_ride (default) or parcel for courier supply. */
  serviceType?: "person_ride" | "parcel";
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
    tripKm != null && Number.isFinite(tripKm) && tripKm > 0
      ? Math.round(tripKm * 10) / 10
      : null;
  const serviceType = geoHints?.serviceType ?? "person_ride";

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
      serviceType,
    ],
    queryFn: ({ signal }) =>
      getRideAvailability({
        pickupLat: pickupLat!,
        pickupLng: pickupLng!,
        tripKm: tripKmKey ?? undefined,
        pickupPincode: geoHints?.pickupPincode,
        pickupState: geoHints?.pickupState,
        rideType: rideType ?? undefined,
        serviceType,
        signal,
      }),
    enabled,
    refetchInterval: (query) => {
      // Stop hammering when the last call failed (e.g. old clients / transient 400).
      if (query.state.status === "error") return false;
      return 8_000;
    },
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    // Keep prior riders visible while a refined tripKm refetch runs.
    placeholderData: keepPreviousData,
    retry: 1,
    retryDelay: 400,
    // Fail soft — book UI must not spin forever on a hung availability call.
    networkMode: "online",
  });
}
