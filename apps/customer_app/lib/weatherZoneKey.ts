/** Matches backend `buildZoneKey` grid cell (~1.1 km). */
export function buildWeatherZoneKey(lat: number, lng: number): string {
  const zLat = Math.round(lat * 100) / 100;
  const zLng = Math.round(lng * 100) / 100;
  return `grid:${zLat}_${zLng}`;
}
