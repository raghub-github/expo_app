/** Resolve pickup/drop pins from orders_core (incl. geocoded JSON fallbacks). */

export type ResolvedMapPin = { lat: number; lng: number };

function finiteCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isValidMapCoordinate(lat: unknown, lng: unknown): boolean {
  const latN = finiteCoord(lat);
  const lngN = finiteCoord(lng);
  if (latN == null || lngN == null) return false;
  if (Math.abs(latN) < 1e-5 && Math.abs(lngN) < 1e-5) return false;
  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) return false;
  return true;
}

export function parseGeocodedLatLng(
  raw: string | null | undefined
): ResolvedMapPin | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const lat = finiteCoord(parsed.lat ?? parsed.latitude);
    const lng = finiteCoord(parsed.lng ?? parsed.lon ?? parsed.longitude);
    if (lat != null && lng != null && isValidMapCoordinate(lat, lng)) {
      return { lat, lng };
    }
  } catch {
    // fall through
  }
  const comma = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (comma) {
    const lat = Number(comma[1]);
    const lng = Number(comma[2]);
    if (isValidMapCoordinate(lat, lng)) return { lat, lng };
  }
  return null;
}

export function resolvePickupCoordinates(
  pickupLat: unknown,
  pickupLon: unknown,
  pickupGeocoded?: string | null
): ResolvedMapPin | null {
  if (isValidMapCoordinate(pickupLat, pickupLon)) {
    return { lat: Number(pickupLat), lng: Number(pickupLon) };
  }
  return parseGeocodedLatLng(pickupGeocoded);
}

export function resolveDropCoordinates(
  dropLat: unknown,
  dropLon: unknown,
  dropGeocoded?: string | null
): ResolvedMapPin | null {
  if (isValidMapCoordinate(dropLat, dropLon)) {
    return { lat: Number(dropLat), lng: Number(dropLon) };
  }
  return parseGeocodedLatLng(dropGeocoded);
}

/** True when text is only lat/lng (comma pair or JSON), not a street address. */
export function isCoordinateLikeAddressText(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  return parseGeocodedLatLng(raw.trim()) != null;
}

/** Prefer human-readable address; skip coordinate-only strings. */
export function resolveHumanAddressLabel(
  candidates: (string | null | undefined)[],
  fallback: string
): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (!t) continue;
    if (!isCoordinateLikeAddressText(t)) return t;
  }
  return fallback;
}
