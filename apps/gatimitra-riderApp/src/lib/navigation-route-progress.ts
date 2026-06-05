import type { LatLng } from "@/src/services/maps/directions.service";
import { distanceMeters } from "@/src/services/maps/directions.service";

export type RouteProgressSplit = {
  traveled: LatLng[];
  /** Blue route on road only — from snap on polyline forward (no off-road segment). */
  remaining: LatLng[];
  /** Nearest point on route polyline (connector meets blue line here). */
  routeJoinPoint: LatLng;
  /** GPS + heading → front wheel anchor for dashed connector. */
  frontWheel: LatLng;
  snapIndex: number;
  remainingDistanceM: number;
  traveledDistanceM: number;
};

const EARTH_R = 6371000;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

/** Bearing from a → b in degrees (0 = north). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function lerpAngle(from: number, to: number, t: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * t + 360) % 360;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number } {
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

/** Closest point on polyline + segment index. */
export function closestPointOnRoute(
  route: LatLng[],
  rider: LatLng
): { point: LatLng; segmentIndex: number; distanceM: number } {
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

function polylineLength(coords: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += distanceMeters(coords[i - 1]!, coords[i]!);
  }
  return sum;
}

/** Offset point along bearing by meters. */
export function offsetPoint(from: LatLng, bearingDeg: number, meters: number): LatLng {
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

/** Trim last segment so line stops before anchor (marker footprint). */
export function trimRouteEndBeforePoint(route: LatLng[], end: LatLng, stopBeforeM = 32): LatLng[] {
  if (route.length < 2) return route;
  const last = route[route.length - 1]!;
  const prev = route[route.length - 2]!;
  const approach = bearingDegrees(prev, end);
  const trimmedEnd = offsetPoint(end, (approach + 180) % 360, stopBeforeM);
  const out = [...route.slice(0, -1), trimmedEnd];
  return out;
}

/** Trim first segment so line starts after rider marker. */
export function trimRouteStartAfterPoint(route: LatLng[], start: LatLng, startAfterM = 22): LatLng[] {
  if (route.length < 2) return route;
  const first = route[0]!;
  const next = route[1]!;
  const depart = bearingDegrees(first, next);
  const trimmedStart = offsetPoint(first, depart, startAfterM);
  return [trimmedStart, ...route.slice(1)];
}

const MIN_RIDER_ROUTE_POINT_M = 2;

/** GPS → front wheel (~2 m ahead along heading) for route line anchor. */
export const RIDER_FRONT_WHEEL_OFFSET_M = 2;

export type RiderOnRoute = LatLng & { headingDeg?: number };

export function riderFrontWheelPoint(
  rider: RiderOnRoute,
  fallbackBearingDeg?: number
): LatLng {
  let heading = rider.headingDeg;
  if (heading == null || !Number.isFinite(heading)) {
    heading = fallbackBearingDeg ?? 0;
  }
  return offsetPoint(rider, heading, RIDER_FRONT_WHEEL_OFFSET_M);
}

function buildRemainingOnRoad(remainingRaw: LatLng[]): LatLng[] {
  if (remainingRaw.length < 2) return remainingRaw;
  const dest = remainingRaw[remainingRaw.length - 1]!;
  const trimmed = trimRouteEndBeforePoint(remainingRaw, dest);
  return trimmed.length >= 2 ? trimmed : remainingRaw;
}

export function splitRouteProgress(route: LatLng[], rider: RiderOnRoute): RouteProgressSplit {
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

  const pathForDistance =
    distanceMeters(rider, snap) < MIN_RIDER_ROUTE_POINT_M
      ? [frontWheel, ...remainingRaw.slice(1)]
      : [frontWheel, ...remainingRaw];

  const traveled =
    traveledRaw.length >= 2 ? trimRouteEndBeforePoint(traveledRaw, snap, 20) : [];

  return {
    traveled,
    remaining,
    routeJoinPoint: snap,
    frontWheel,
    snapIndex: segmentIndex,
    remainingDistanceM: polylineLength(pathForDistance),
    traveledDistanceM: polylineLength(traveledRaw),
  };
}

/** ETA minutes from remaining meters (avg ~22 km/h in town). */
export function etaMinutesFromMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 1;
  const speedMps = 6.1;
  return Math.max(1, Math.round(meters / speedMps / 60));
}

export function distanceOffRouteMeters(route: LatLng[], rider: LatLng): number {
  if (route.length < 2) return 0;
  return closestPointOnRoute(route, rider).distanceM;
}

export type RiderRouteDeviation = {
  offRouteM: number;
  snapPoint: LatLng;
  segmentIndex: number;
  routeBearingDeg: number;
  /** Rider heading differs from route direction (moving wrong way on road). */
  wrongWay: boolean;
  headingDeltaDeg: number;
};

const WRONG_WAY_MIN_HEADING_DELTA = 95;
/** Min gap (m) before drawing dashed rider → route join connector. */
export const RIDER_ROUTE_CONNECTOR_MIN_M = 0.5;
export const OFF_ROUTE_REROUTE_M = 32;

function headingDeltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** Snap rider to route + detect wrong-way / off-route (for map + reroute). */
export function analyzeRiderOnRoute(
  route: LatLng[],
  rider: RiderOnRoute
): RiderRouteDeviation | null {
  if (route.length < 2) return null;

  const { point: snap, segmentIndex, distanceM } = closestPointOnRoute(route, rider);
  const segEnd = route[Math.min(segmentIndex + 1, route.length - 1)]!;
  const segStart = route[segmentIndex]!;
  const routeBearing = bearingDegrees(segStart, segEnd);

  let wrongWay = false;
  let delta = 0;

  if (rider.headingDeg != null && Number.isFinite(rider.headingDeg)) {
    delta = headingDeltaDeg(rider.headingDeg, routeBearing);
    wrongWay = delta >= WRONG_WAY_MIN_HEADING_DELTA && distanceM >= 5;
  } else if (distanceM >= 12) {
    const towardSnap = bearingDegrees(rider, snap);
    delta = headingDeltaDeg(towardSnap, routeBearing);
    wrongWay = delta >= 75 && delta <= 105;
  }

  return {
    offRouteM: distanceM,
    snapPoint: snap,
    segmentIndex,
    routeBearingDeg: routeBearing,
    wrongWay,
    headingDeltaDeg: delta,
  };
}

export type RouteConnectorFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: Record<string, never>;
};

/** Dashed connector: rider map position → route join on blue polyline (Google Maps style). */
export function buildRiderRouteConnectorGeoJson(
  riderPosition: LatLng,
  routeJoin: LatLng
): RouteConnectorFeature | null {
  const gapM = distanceMeters(riderPosition, routeJoin);
  if (gapM < RIDER_ROUTE_CONNECTOR_MIN_M) return null;

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [riderPosition.longitude, riderPosition.latitude],
        [routeJoin.longitude, routeJoin.latitude],
      ],
    },
    properties: {},
  };
}

/** @deprecated Use buildRiderRouteConnectorGeoJson with splitRouteProgress wheel + join. */
export function buildOffRouteConnectorGeoJson(
  rider: RiderOnRoute,
  snap: LatLng,
  routeBearingDeg?: number
): RouteConnectorFeature | null {
  const wheel = riderFrontWheelPoint(rider, routeBearingDeg);
  return buildRiderRouteConnectorGeoJson(wheel, snap);
}
