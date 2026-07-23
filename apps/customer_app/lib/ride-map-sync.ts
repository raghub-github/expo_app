import type { LatLng } from "@/services/directions.service";

export type ScreenPoint = { x: number; y: number };

export function latLngFromStrings(lat?: string, lng?: string): LatLng | null {
  if (lat == null || lng == null || String(lat).trim() === "" || String(lng).trim() === "") {
    return null;
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export function latLngKey(point: LatLng | null | undefined): string {
  if (!point) return "";
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

export function nearlySameScreenPoint(a: ScreenPoint | null, b: ScreenPoint | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a.x - b.x) < 0.75 && Math.abs(a.y - b.y) < 0.75;
}
