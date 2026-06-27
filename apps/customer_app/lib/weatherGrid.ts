/** ~1.1 km grid — stable cache key across minor address label changes. */
export function weatherGridKey(lat: number, lng: number): string {
  const zLat = Math.round(lat * 100) / 100;
  const zLng = Math.round(lng * 100) / 100;
  return `${zLat}_${zLng}`;
}

export function isSameWeatherGrid(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): boolean {
  return weatherGridKey(a.latitude, a.longitude) === weatherGridKey(b.latitude, b.longitude);
}
