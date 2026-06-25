import { haversineKm } from "@/lib/billSummary";
import type { ServiceId } from "@/features/ride/AllServicesGrid";
import { RIDE_OPTIONS } from "@/features/ride/rideOptions";
import { estimateRideFare } from "@/features/ride/rideOptions";

/** Minimum straight-line trip distance to qualify as inter city. */
export const INTERCITY_MIN_DISTANCE_KM = 15;

export const INTERCITY_SERVICE_IDS: ServiceId[] = ["cab-economy", "cab-premium"];

export function isIntercityRouteKm(km: number | null | undefined): boolean {
  return km != null && Number.isFinite(km) && km >= INTERCITY_MIN_DISTANCE_KM;
}

export function tripKmFromCoords(
  pickupLat?: string | null,
  pickupLng?: string | null,
  dropLat?: string | null,
  dropLng?: string | null
): number | null {
  const plat = Number(pickupLat);
  const plng = Number(pickupLng);
  const dlat = Number(dropLat);
  const dlng = Number(dropLng);
  if (![plat, plng, dlat, dlng].every(Number.isFinite)) return null;
  const km = haversineKm({ latitude: plat, longitude: plng }, { latitude: dlat, longitude: dlng });
  return Number.isFinite(km) && km > 0 ? km : null;
}

export function getIntercityRideOptions(tripKm: number | null) {
  const eligible = isIntercityRouteKm(tripKm);
  return INTERCITY_SERVICE_IDS.map((id) => {
    const option = RIDE_OPTIONS.find((r) => r.id === id);
    if (!option) return null;
    const estFare =
      tripKm != null && tripKm > 0 ? estimateRideFare(option.baseFare, tripKm) : null;
    return {
      id: option.id as ServiceId,
      label: option.name,
      subtitle: option.subtitle ?? "Inter city ride",
      estFare,
      disabled: !eligible,
    };
  }).filter((row): row is NonNullable<typeof row> => row != null);
}
