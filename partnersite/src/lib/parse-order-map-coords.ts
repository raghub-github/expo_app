/** Shared map coordinate helpers (aligned with dashboard order map). */

function pickCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coerceCoord(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  const latN = coerceCoord(lat);
  const lonN = coerceCoord(lon);
  if (latN == null || lonN == null) return false;
  if (latN === 0 && lonN === 0) return false;
  if (Math.abs(latN) > 90 || Math.abs(lonN) > 180) return false;
  return true;
}

export function toMapLngLat(lat: unknown, lon: unknown): [number, number] | null {
  const latN = coerceCoord(lat);
  const lonN = coerceCoord(lon);
  if (isValidLatLon(latN, lonN)) return [lonN!, latN!];
  if (isValidLatLon(lonN, latN)) return [latN!, lonN!];
  return null;
}

export function parseGeocodedLatLon(
  raw: string | null | undefined
): { lat: number; lon: number } | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const lat = pickCoord(parsed.lat ?? parsed.latitude);
    const lon = pickCoord(parsed.lng ?? parsed.lon ?? parsed.longitude);
    if (lat != null && lon != null) return { lat, lon };
  } catch {
    /* fall through */
  }
  const commaMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (commaMatch) {
    const lat = Number(commaMatch[1]);
    const lon = Number(commaMatch[2]);
    if (isValidLatLon(lat, lon)) return { lat, lon };
  }
  return null;
}

export function resolveStoreMapLngLat(sources: {
  merchantLat?: unknown;
  merchantLon?: unknown;
  pickupLat?: unknown;
  pickupLon?: unknown;
  pickupGeocoded?: string | null;
}): [number, number] | null {
  const fromMerchant = toMapLngLat(sources.merchantLat, sources.merchantLon);
  if (fromMerchant) return fromMerchant;

  const fromPickup = toMapLngLat(sources.pickupLat, sources.pickupLon);
  if (fromPickup) return fromPickup;

  const parsed = parseGeocodedLatLon(sources.pickupGeocoded);
  if (parsed) return toMapLngLat(parsed.lat, parsed.lon);

  return null;
}

export function toLatLngPin(lngLat: [number, number]): { latitude: number; longitude: number } {
  return { latitude: lngLat[1], longitude: lngLat[0] };
}
