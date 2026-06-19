import { haversineKm } from "@/lib/billSummary";

export type MapLatLng = { latitude: number; longitude: number };

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

/** Bearing in degrees (0 = north) from point A → B. */
export function bearingDegrees(from: MapLatLng, to: MapLatLng): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function nearestRouteIndex(route: MapLatLng[], point: MapLatLng): number {
  if (route.length === 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const coord = route[i]!;
    const d = haversineMeters(point.latitude, point.longitude, coord.latitude, coord.longitude);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Remaining path from rider position to pickup along the road polyline. */
export function sliceRouteFromRider(route: MapLatLng[], rider: MapLatLng | null): MapLatLng[] {
  if (route.length < 2) return route;
  if (!rider) return route;
  const idx = nearestRouteIndex(route, rider);
  const tail = route.slice(idx);
  if (tail.length === 0) return [rider, route[route.length - 1]!];
  if (haversineMeters(rider.latitude, rider.longitude, tail[0]!.latitude, tail[0]!.longitude) > 8) {
    return [rider, ...tail];
  }
  return tail;
}

export function routeDistanceMeters(route: MapLatLng[]): number {
  if (route.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1]!;
    const b = route[i]!;
    total += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return total;
}

/** Zomato-style dashed preview arc between store and customer before a rider is assigned. */
export function buildPickupDropPreviewArc(
  from: MapLatLng,
  to: MapLatLng,
  segments = 32
): MapLatLng[] {
  const mid: MapLatLng = {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2,
  };
  const dx = to.longitude - from.longitude;
  const dy = to.latitude - from.latitude;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bulge = dist * 0.16;
  const control: MapLatLng = {
    latitude: mid.latitude + ny * bulge,
    longitude: mid.longitude + nx * bulge,
  };
  const points: MapLatLng[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      latitude: u * u * from.latitude + 2 * u * t * control.latitude + t * t * to.latitude,
      longitude: u * u * from.longitude + 2 * u * t * control.longitude + t * t * to.longitude,
    });
  }
  return points;
}
