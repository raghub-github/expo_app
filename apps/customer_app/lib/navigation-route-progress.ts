import { bearingDegrees, haversineMeters, type MapLatLng } from "@/lib/map-route-utils";

export type RouteProgressSplit = {
  traveled: MapLatLng[];
  remaining: MapLatLng[];
  routeJoinPoint: MapLatLng;
  frontWheel: MapLatLng;
  snapIndex: number;
  remainingDistanceM: number;
  traveledDistanceM: number;
};

const EARTH_R = 6371000;
const MIN_RIDER_ROUTE_POINT_M = 2;
export const RIDER_FRONT_WHEEL_OFFSET_M = 2;
export const OFF_ROUTE_REROUTE_M = 32;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

function distanceMeters(a: MapLatLng, b: MapLatLng): number {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

export function lerpLatLng(a: MapLatLng, b: MapLatLng, t: number): MapLatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

function projectOnSegment(p: MapLatLng, a: MapLatLng, b: MapLatLng): { point: MapLatLng; t: number } {
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

export function closestPointOnRoute(
  route: MapLatLng[],
  rider: MapLatLng
): { point: MapLatLng; segmentIndex: number; distanceM: number } {
  if (route.length === 0) {
    return { point: rider, segmentIndex: 0, distanceM: 0 };
  }
  if (route.length === 1) {
    return { point: route[0]!, segmentIndex: 0, distanceM: distanceMeters(rider, route[0]!) };
  }

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

  return { point: bestPoint, segmentIndex: bestSeg, distanceM: bestDist };
}

function polylineLength(coords: MapLatLng[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += distanceMeters(coords[i - 1]!, coords[i]!);
  }
  return sum;
}

export function offsetPoint(from: MapLatLng, bearingDeg: number, meters: number): MapLatLng {
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

/** Trim last segment so line stops before destination pin (no overlap). */
export function trimRouteEndBeforePoint(route: MapLatLng[], end: MapLatLng, stopBeforeM = 32): MapLatLng[] {
  if (route.length < 2) return route;
  const prev = route[route.length - 2]!;
  const approach = bearingDegrees(prev, end);
  const trimmedEnd = offsetPoint(end, (approach + 180) % 360, stopBeforeM);
  return [...route.slice(0, -1), trimmedEnd];
}

function buildRemainingOnRoad(remainingRaw: MapLatLng[]): MapLatLng[] {
  if (remainingRaw.length < 2) return remainingRaw;
  const dest = remainingRaw[remainingRaw.length - 1]!;
  const trimmed = trimRouteEndBeforePoint(remainingRaw, dest);
  return trimmed.length >= 2 ? trimmed : remainingRaw;
}

export type RiderOnRoute = MapLatLng & { headingDeg?: number | null };

export function riderFrontWheelPoint(rider: RiderOnRoute, fallbackBearingDeg?: number): MapLatLng {
  let heading = rider.headingDeg;
  if (heading == null || !Number.isFinite(heading)) {
    heading = fallbackBearingDeg ?? 0;
  }
  return offsetPoint(rider, heading, RIDER_FRONT_WHEEL_OFFSET_M);
}

export function splitRouteProgress(route: MapLatLng[], rider: RiderOnRoute): RouteProgressSplit {
  if (route.length < 2) {
    const join = route[0] ?? rider;
    const lead =
      route.length === 1
        ? riderFrontWheelPoint(rider, bearingDegrees(rider, route[0]!))
        : riderFrontWheelPoint(rider);
    const remaining =
      route.length === 1 && distanceMeters(lead, route[0]!) >= MIN_RIDER_ROUTE_POINT_M
        ? [join, route[0]!]
        : route.length === 1
          ? [join, route[0]!]
          : route;
    return {
      traveled: [],
      remaining,
      routeJoinPoint: join,
      frontWheel: lead,
      snapIndex: 0,
      remainingDistanceM: polylineLength(remaining),
      traveledDistanceM: 0,
    };
  }

  const { point: snap, segmentIndex } = closestPointOnRoute(route, rider);
  const leadBearing = rider.headingDeg ?? bearingDegrees(rider, snap);
  const frontWheel = riderFrontWheelPoint(rider, leadBearing);

  const traveledRaw = [...route.slice(0, segmentIndex + 1), snap];
  const remainingRaw = [snap, ...route.slice(segmentIndex + 1)];
  const remaining = buildRemainingOnRoad(remainingRaw);

  const traveled =
    traveledRaw.length >= 2 ? trimRouteEndBeforePoint(traveledRaw, snap, 20) : [];

  return {
    traveled,
    remaining,
    routeJoinPoint: snap,
    frontWheel,
    snapIndex: segmentIndex,
    remainingDistanceM: polylineLength(remainingRaw),
    traveledDistanceM: polylineLength(traveledRaw),
  };
}

export function buildRiderRouteConnector(
  riderPosition: MapLatLng,
  routeJoin: MapLatLng
): MapLatLng[] | null {
  const gapM = distanceMeters(riderPosition, routeJoin);
  if (gapM < 0.5) return null;
  return [riderPosition, routeJoin];
}

export function etaMinutesFromMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 1;
  const speedMps = 6.1;
  return Math.max(1, Math.round(meters / speedMps / 60));
}
