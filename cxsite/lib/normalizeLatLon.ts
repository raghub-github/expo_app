/**
 * One canonical precision for GPS → URL → reverse-geocode so Near Me, header auto-detect,
 * and location popups all resolve the same place name for the same physical position.
 */
export function normalizeLatLonForStorage(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
  }
}

/** Query string for `/api/locations/reverse-geocode` (no nocache — shared server cache per pin). */
export function reverseGeocodeSearchParams(lat: number, lon: number): string {
  const { lat: a, lon: b } = normalizeLatLonForStorage(lat, lon)
  return `lat=${encodeURIComponent(String(a))}&lon=${encodeURIComponent(String(b))}`
}
