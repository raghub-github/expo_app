import { catalogCodeToPricingVehicle } from "./catalogVehicleMap.js";
import type { RideVehicleLimitRow } from "./rideStateConfig.repository.js";

export function isCatalogOptionEligibleForTrip(args: {
  catalogCode: string;
  tripKm: number;
  limits: RideVehicleLimitRow[];
}): boolean {
  const vehicle = catalogCodeToPricingVehicle(args.catalogCode);
  if (!vehicle) return true;
  // No row or disabled cap => unlimited (inter-state / all-India trips allowed).
  const limit = args.limits.find((l) => l.vehicleType === vehicle && l.isEnabled);
  if (!limit || limit.maxDistanceKm <= 0) return true;
  return args.tripKm <= limit.maxDistanceKm;
}
