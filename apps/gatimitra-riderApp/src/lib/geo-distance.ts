/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Skip order pickup pins that would stack on the rider "You" marker. */
export const MIN_RIDER_ORDER_PIN_SEPARATION_M = 120;

export function isOrderPinAwayFromRider(
  riderLat: number,
  riderLng: number,
  pickupLat: number,
  pickupLng: number
): boolean {
  return distanceMeters(riderLat, riderLng, pickupLat, pickupLng) >= MIN_RIDER_ORDER_PIN_SEPARATION_M;
}
