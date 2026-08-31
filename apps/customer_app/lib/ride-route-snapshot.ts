import type { LatLng } from "@/services/directions.service";

export type RideRouteStop = {
  latitude: number;
  longitude: number;
};

export type RideRouteSnapshot = {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  stops: RideRouteStop[];
  routeDistanceMeters: number;
  routeDistanceKm: number;
  routeDurationSeconds: number;
  routeEtaMinutes: number;
  routePolyline: LatLng[];
  routeSource: "mapbox" | "osrm" | "backend";
  computedAt: number;
  /** NH/SH (or main road) for the Via chip. */
  viaLabel?: string | null;
};

function roundCoord(value: number): string {
  return value.toFixed(5);
}

export function buildRideRouteKey(args: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  stops?: RideRouteStop[];
}): string {
  const stopKey = (args.stops ?? [])
    .map((s) => `${roundCoord(s.latitude)},${roundCoord(s.longitude)}`)
    .join("|");
  return [
    roundCoord(args.pickupLat),
    roundCoord(args.pickupLng),
    roundCoord(args.dropLat),
    roundCoord(args.dropLng),
    stopKey,
  ].join("\u0000");
}

/** Consistent ride distance label — one decimal km (e.g. 18.4 km). */
export function formatRideDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km <= 0) return null;
  return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
}

export function rideDistanceKmForFare(snapshot: RideRouteSnapshot | null | undefined): number | null {
  if (!snapshot) return null;
  const km = snapshot.routeDistanceKm;
  if (!Number.isFinite(km) || km <= 0) return null;
  return Math.round(km * 100) / 100;
}

export function logRideRouteDebug(
  stage: string,
  payload: Record<string, unknown>
): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[ride-route] ${stage}`, JSON.stringify(payload));
}
