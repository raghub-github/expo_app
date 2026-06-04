/**
 * Generate nearby snap points around a pickup coordinate (Rapido-style).
 */

export type PickupSnapPoint = {
  id: string;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_M = 6_371_000;

function offsetCoordinate(
  latitude: number,
  longitude: number,
  bearingDeg: number,
  distanceM: number
): { latitude: number; longitude: number } {
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (latitude * Math.PI) / 180;
  const lng1 = (longitude * Math.PI) / 180;
  const angular = distanceM / EARTH_RADIUS_M;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lng2 * 180) / Math.PI,
  };
}

/** Ring of snap points ~50–90 m from the anchor for easier roadside pickup. */
export function buildNearbyPickupSnaps(
  latitude: number,
  longitude: number,
  count = 5
): PickupSnapPoint[] {
  const bearings = [15, 95, 175, 255, 335];
  return bearings.slice(0, count).map((bearing, index) => {
    const distanceM = 52 + index * 12;
    const coord = offsetCoordinate(latitude, longitude, bearing, distanceM);
    return {
      id: `snap-${index}`,
      latitude: coord.latitude,
      longitude: coord.longitude,
    };
  });
}
