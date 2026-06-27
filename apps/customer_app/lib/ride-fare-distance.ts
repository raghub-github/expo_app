import { rideDistanceKmForFare } from "@/lib/ride-route-snapshot";
import { useRideRouteStore } from "@/store/rideRouteStore";

export type RideFareDistanceParams = {
  routeDistanceKm?: string | number;
  tripKm?: string | number;
};

/** Parse canonical fare route km from navigation params (booking → confirm → searching). */
export function parseRideFareDistanceKm(
  params: RideFareDistanceParams | null | undefined
): number | undefined {
  const raw = params?.routeDistanceKm ?? params?.tripKm;
  if (raw == null || raw === "") return undefined;
  const km = Number(raw);
  if (!Number.isFinite(km) || km <= 0) return undefined;
  return Math.round(km * 100) / 100;
}

/** Last computed canonical route from the ride route store. */
export function rideFareDistanceFromStore(): number | undefined {
  const snapshot = useRideRouteStore.getState().snapshot;
  const km = rideDistanceKmForFare(snapshot);
  return km ?? undefined;
}

/**
 * Fare-quoted distance for UI + placement — never replace with a shorter server haversine.
 * Priority: nav params → trip state → route store → order record.
 */
export function resolveRideFareDistanceKm(args: {
  params?: RideFareDistanceParams | null;
  tripStateKm?: number | null;
  orderDistanceKm?: number | null;
}): number | undefined {
  const fromParams = parseRideFareDistanceKm(args.params ?? undefined);
  if (fromParams != null) return fromParams;

  if (
    args.tripStateKm != null &&
    Number.isFinite(args.tripStateKm) &&
    args.tripStateKm > 0
  ) {
    return Math.round(args.tripStateKm * 100) / 100;
  }

  const fromStore = rideFareDistanceFromStore();
  if (fromStore != null) return fromStore;

  if (
    args.orderDistanceKm != null &&
    Number.isFinite(args.orderDistanceKm) &&
    args.orderDistanceKm > 0
  ) {
    return Math.round(args.orderDistanceKm * 100) / 100;
  }

  return undefined;
}

export function rideFareDistanceNavParams(km: number): Record<string, string> {
  const rounded = Math.round(km * 100) / 100;
  const text = String(rounded);
  return {
    tripKm: text,
    routeDistanceKm: text,
  };
}
