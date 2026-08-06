/**
 * Parcel vehicle ETAs — travel time from map route + pickup away time from nearby supply.
 */

import type { NearbySupplyRider } from "@/services/rideAvailability.service";
import type { ParcelVehicleCategoryCode } from "./parcelGuidelinesConfig";

/** Dispatch vehicle codes that can serve each parcel category. */
const PARCEL_CATEGORY_VEHICLE_CODES: Record<ParcelVehicleCategoryCode, string[]> = {
  "2_wheeler": ["bike", "ev_bike", "scooter", "cycle", "2_wheeler"],
  "3_wheeler": ["auto", "cng_auto", "ev_auto", "e_rickshaw", "cargo_auto", "3_wheeler"],
  "4_wheeler_non_ac": [
    "car",
    "taxi",
    "ev_car",
    "cargo_van",
    "mini_truck",
    "pickup",
    "tata_ace",
    "car_non_ac",
    "4_wheeler_non_ac",
  ],
};

/** Fallback pickup away mins when no nearby rider for that category. */
const FALLBACK_AWAY_MINS: Record<ParcelVehicleCategoryCode, number> = {
  "2_wheeler": 3,
  "3_wheeler": 5,
  "4_wheeler_non_ac": 8,
};

function riderMatchesCategory(
  rider: NearbySupplyRider,
  category: ParcelVehicleCategoryCode
): boolean {
  const allowed = new Set(PARCEL_CATEGORY_VEHICLE_CODES[category].map((c) => c.toLowerCase()));
  const types = (rider.vehicleTypes?.length ? rider.vehicleTypes : [rider.vehicleType]).map((t) =>
    String(t ?? "")
      .trim()
      .toLowerCase()
  );
  return types.some((t) => allowed.has(t));
}

/** Estimated minutes for rider to reach pickup from distance km. */
function awayMinsFromKm(km: number): number {
  if (!(km > 0)) return 1;
  // ~20 km/h city crawl → 3 min/km, clamp 1–25
  return Math.max(1, Math.min(25, Math.round(km * 3)));
}

export function parcelVehicleAwayMins(
  category: ParcelVehicleCategoryCode,
  riders: NearbySupplyRider[] | null | undefined
): number {
  const matched = (riders ?? []).filter((r) => riderMatchesCategory(r, category));
  if (matched.length === 0) return FALLBACK_AWAY_MINS[category];
  let nearest = Infinity;
  for (const r of matched) {
    const km = Number(r.distanceKm);
    if (Number.isFinite(km) && km >= 0 && km < nearest) nearest = km;
  }
  if (!Number.isFinite(nearest)) return FALLBACK_AWAY_MINS[category];
  return awayMinsFromKm(nearest);
}

/** Total ETA shown on book card = pickup away + route travel (map). */
export function parcelVehicleTotalEtaMins(args: {
  category: ParcelVehicleCategoryCode;
  routeEtaMins: number | null;
  tripKm: number | null;
  riders?: NearbySupplyRider[] | null;
}): number {
  const travel =
    args.routeEtaMins != null && args.routeEtaMins > 0
      ? args.routeEtaMins
      : Math.max(5, Math.round((args.tripKm ?? 3) * 2.5));
  const away = parcelVehicleAwayMins(args.category, args.riders);
  return away + travel;
}
