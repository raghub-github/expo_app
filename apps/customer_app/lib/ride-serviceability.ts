/**
 * Client-side ride route serviceability until mobility coverage API is wired.
 */

import { haversineKm } from "@/lib/billSummary";

/** Max straight-line pickup → drop distance we currently support (km). */
export const MAX_RIDE_SERVICE_DISTANCE_KM = 70;

type RideCoord = { latitude: number; longitude: number };

function isValidCoord(c: RideCoord | null | undefined): c is RideCoord {
  return (
    c != null &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude)
  );
}

/**
 * Returns false when the route is outside current ride coverage.
 * Replace with backend `/mobility/serviceability` when available.
 */
export function isRideRouteServiceable(
  pickup: RideCoord | null | undefined,
  drop: RideCoord | null | undefined,
  stops: RideCoord[] = []
): boolean {
  if (!isValidCoord(pickup) || !isValidCoord(drop)) return true;

  const path = [pickup, ...stops.filter(isValidCoord), drop];
  if (path.length < 2) return true;

  let totalKm = 0;
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    totalKm += haversineKm(prev.latitude, prev.longitude, next.latitude, next.longitude);
  }

  return totalKm <= MAX_RIDE_SERVICE_DISTANCE_KM;
}

export function parseRideStopsParam(stopsJson?: string): RideCoord[] {
  if (!stopsJson?.trim()) return [];
  try {
    const parsed = JSON.parse(stopsJson) as Array<{
      latitude?: number | null;
      longitude?: number | null;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          s.latitude != null &&
          s.longitude != null &&
          Number.isFinite(s.latitude) &&
          Number.isFinite(s.longitude)
      )
      .map((s) => ({ latitude: s.latitude!, longitude: s.longitude! }));
  } catch {
    return [];
  }
}
