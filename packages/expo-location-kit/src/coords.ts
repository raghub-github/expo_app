import type { ValidatedCoords } from "./types";

/** Reject NaN/Infinity, out-of-range, and null-island (0,0) coordinates before use. */
export function validateCoords(
  loc:
    | {
        coords?: {
          latitude?: number;
          longitude?: number;
          accuracy?: number | null;
        };
      }
    | null
    | undefined
): ValidatedCoords | null {
  const c = loc?.coords;
  if (!c) return null;
  const { latitude, longitude } = c;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return {
    latitude,
    longitude,
    accuracy: typeof c.accuracy === "number" ? c.accuracy : null,
  };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

/** Refresh threshold default matches Customer discovery (~350 m). */
export const LOCATION_SIGNIFICANT_MOVE_METERS = 350;

export function coordsMovedSignificantly(
  a: { latitude: number; longitude: number } | null | undefined,
  b: { latitude: number; longitude: number } | null | undefined,
  thresholdMeters = LOCATION_SIGNIFICANT_MOVE_METERS
): boolean {
  if (!a || !b) return a !== b;
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude) >= thresholdMeters;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Location request timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
