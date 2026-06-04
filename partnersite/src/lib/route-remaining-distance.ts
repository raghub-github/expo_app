/**
 * Remaining distance along a driving route polyline (aligned with rider app navigation).
 */

export type RouteLatLng = { latitude: number; longitude: number };

const EARTH_R = 6371000;
const MIN_RIDER_ROUTE_POINT_M = 2;
const RIDER_FRONT_WHEEL_OFFSET_M = 2;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function distanceMeters(a: RouteLatLng, b: RouteLatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function bearingDegrees(a: RouteLatLng, b: RouteLatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function offsetPoint(from: RouteLatLng, bearingDeg: number, meters: number): RouteLatLng {
  const br = toRad(bearingDeg);
  const lat1 = toRad(from.latitude);
  const lng1 = toRad(from.longitude);
  const angDist = meters / EARTH_R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { latitude: toDeg(lat2), longitude: toDeg(lng2) };
}

function projectOnSegment(
  p: RouteLatLng,
  a: RouteLatLng,
  b: RouteLatLng
): { point: RouteLatLng; t: number } {
  const ax = a.longitude;
  const ay = a.latitude;
  const bx = b.longitude;
  const by = b.latitude;
  const px = p.longitude;
  const py = p.latitude;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { point: a, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    point: { latitude: ay + dy * t, longitude: ax + dx * t },
    t,
  };
}

function closestPointOnRoute(
  route: RouteLatLng[],
  rider: RouteLatLng
): { point: RouteLatLng; segmentIndex: number } {
  if (route.length === 0) return { point: rider, segmentIndex: 0 };
  if (route.length === 1) return { point: route[0]!, segmentIndex: 0 };

  let bestPoint = route[0]!;
  let bestSeg = 0;
  let bestDist = Infinity;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const { point } = projectOnSegment(rider, a, b);
    const d = distanceMeters(rider, point);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = point;
      bestSeg = i;
    }
  }

  return { point: bestPoint, segmentIndex: bestSeg };
}

function polylineLength(coords: RouteLatLng[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += distanceMeters(coords[i - 1]!, coords[i]!);
  }
  return sum;
}

function trimRouteEndBeforePoint(route: RouteLatLng[], end: RouteLatLng, stopBeforeM = 32): RouteLatLng[] {
  if (route.length < 2) return route;
  const prev = route[route.length - 2]!;
  const approach = bearingDegrees(prev, end);
  const trimmedEnd = offsetPoint(end, (approach + 180) % 360, stopBeforeM);
  return [...route.slice(0, -1), trimmedEnd];
}

function riderFrontWheelPoint(
  rider: RouteLatLng & { headingDeg?: number },
  fallbackBearingDeg?: number
): RouteLatLng {
  const heading =
    rider.headingDeg != null && Number.isFinite(rider.headingDeg)
      ? rider.headingDeg
      : (fallbackBearingDeg ?? 0);
  return offsetPoint(rider, heading, RIDER_FRONT_WHEEL_OFFSET_M);
}

function buildRemainingFromRouteStart(remainingRaw: RouteLatLng[], start: RouteLatLng): RouteLatLng[] {
  const trimmed = trimRouteEndBeforePoint(remainingRaw, remainingRaw[remainingRaw.length - 1]!);
  const first = trimmed[0]!;
  if (distanceMeters(start, first) < MIN_RIDER_ROUTE_POINT_M) {
    return [start, ...trimmed.slice(1)];
  }
  return [start, ...trimmed];
}

/** Remaining driving distance from rider GPS to route end (meters). */
export function remainingDistanceAlongRouteM(
  route: RouteLatLng[],
  rider: RouteLatLng & { headingDeg?: number }
): number {
  if (route.length < 2) {
    if (route.length === 1) {
      const lead = riderFrontWheelPoint(rider, bearingDegrees(rider, route[0]!));
      const remaining =
        distanceMeters(lead, route[0]!) >= MIN_RIDER_ROUTE_POINT_M ? [lead, route[0]!] : [lead];
      return polylineLength(remaining);
    }
    return 0;
  }

  const { point: snap, segmentIndex } = closestPointOnRoute(route, rider);
  const leadBearing = rider.headingDeg ?? bearingDegrees(rider, snap);
  const frontWheel = riderFrontWheelPoint(rider, leadBearing);
  const remainingRaw = [snap, ...route.slice(segmentIndex + 1)];
  const remaining = buildRemainingFromRouteStart(remainingRaw, frontWheel);
  const pathForDistance =
    distanceMeters(rider, snap) < MIN_RIDER_ROUTE_POINT_M
      ? [frontWheel, ...remainingRaw.slice(1)]
      : [frontWheel, ...remainingRaw];
  return polylineLength(pathForDistance);
}

/** Match rider app ETA (~22 km/h). */
export function etaMinutesFromMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 1;
  const speedMps = 6.1;
  return Math.max(1, Math.round(meters / speedMps / 60));
}

export function coordsLngLatToRouteLatLng(coords: Array<[number, number]>): RouteLatLng[] {
  return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}
