/** Live GPS within this many metres of a saved address ⇒ "Current Location" badge. */
export const CURRENT_LOCATION_BADGE_RADIUS_M = 100;

/** Saved-address duplicate match radius (shared link vs address book). */
export const ADDRESS_MATCH_RADIUS_M = 80;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceMeters(m: number): string {
  if (m < 50) return "0 m";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function formatPhoneLine(mobile: string | null | undefined): string | null {
  if (!mobile?.trim()) return null;
  const digits = mobile.replace(/\D/g, "");
  if (!digits) return null;
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `Phone number: +91-${local}`;
}

export function normalizeAddressText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function addressesRoughlyMatch(
  a: { latitude: number; longitude: number; fullAddress: string },
  b: { latitude: number; longitude: number; fullAddress: string }
): boolean {
  if (
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude) &&
    Number.isFinite(b.latitude) &&
    Number.isFinite(b.longitude)
  ) {
    const dist = distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
    if (dist <= ADDRESS_MATCH_RADIUS_M) return true;
  }
  return normalizeAddressText(a.fullAddress) === normalizeAddressText(b.fullAddress);
}
