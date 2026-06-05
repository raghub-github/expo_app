/**
 * Admin helpers for `platform_rider_dispatch_pickup_radius` (pickup radius config only).
 * Runtime dispatch reads radii via order-assignment-engine (always fresh from DB).
 */

export type RiderDispatchServiceType = "food" | "parcel" | "person_ride";

export const RIDER_DISPATCH_SERVICE_TYPES: RiderDispatchServiceType[] = [
  "food",
  "parcel",
  "person_ride",
];

/** Parse admin input like "1 km", "1.5km", "1500 m", "1500" (meters if no unit). */
export function parseRadiusToMeters(raw: string): number {
  const input = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!input) {
    throw new Error("Radius is required");
  }

  const kmMatch = input.match(/^([\d.]+)\s*km$/);
  if (kmMatch) {
    const km = Number(kmMatch[1]);
    if (!Number.isFinite(km) || km <= 0 || km > 50) {
      throw new Error("Enter a radius between 0.1 km and 50 km");
    }
    return Math.round(km * 1000);
  }

  const mMatch = input.match(/^([\d.]+)\s*m(?:eters?)?$/);
  if (mMatch) {
    const m = Number(mMatch[1]);
    if (!Number.isFinite(m) || m <= 0 || m > 50_000) {
      throw new Error("Enter a radius between 1 m and 50000 m");
    }
    return Math.round(m);
  }

  const bare = Number(input);
  if (Number.isFinite(bare) && bare > 0) {
    if (bare <= 50) {
      return Math.round(bare * 1000);
    }
    if (bare <= 50_000) {
      return Math.round(bare);
    }
  }

  throw new Error('Use format like "1 km", "1.5 km", or "1500 m"');
}

export function formatRadiusDisplay(meters: number): string {
  const m = Math.round(meters);
  if (m >= 1000 && m % 1000 === 0) {
    return `${m / 1000} km`;
  }
  if (m >= 1000) {
    return `${(m / 1000).toFixed(1).replace(/\.0$/, "")} km`;
  }
  return `${m} m`;
}

export {
  fetchAllPickupRadiiMeters as loadDispatchPickupRadiusMetersByService,
  fetchPickupRadiusMeters,
} from "./order-assignment-engine.js";
