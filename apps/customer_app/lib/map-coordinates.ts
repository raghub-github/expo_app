/** Valid lat/lng for map display (rejects null island / missing coords). */
export function isValidMapCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return Math.abs(lat) > 1e-4 || Math.abs(lng) > 1e-4;
}

export function parseMapCoordParam(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value === "") return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveMapCenter(
  latitude: number,
  longitude: number,
  fallback: { latitude: number; longitude: number }
): { latitude: number; longitude: number } {
  if (isValidMapCoordinate(latitude, longitude)) {
    return { latitude, longitude };
  }
  return { ...fallback };
}
