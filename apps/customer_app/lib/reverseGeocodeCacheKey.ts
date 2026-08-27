/**
 * Pure coordinate → cache-key normalization for reverse-geocoding (spec §20).
 *
 * Rounding to 4 decimals collapses points within ~11 m into one cache cell, so tiny GPS
 * fluctuations while the user stays put reuse a single Mapbox lookup. Kept dependency-free
 * so the normalization is unit-testable in isolation.
 */

/** Round to 4 decimals (~11 m) so near-identical coordinates share one lookup. */
export function reverseGeocodeKey(longitude: number, latitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

/** True when two coordinates fall in the same reverse-geocode cache cell (~11 m). */
export function sameReverseGeocodeCell(
  a: { latitude: number; longitude: number } | null | undefined,
  b: { latitude: number; longitude: number } | null | undefined
): boolean {
  if (!a || !b) return false;
  return reverseGeocodeKey(a.longitude, a.latitude) === reverseGeocodeKey(b.longitude, b.latitude);
}
