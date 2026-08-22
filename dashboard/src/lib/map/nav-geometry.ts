/**
 * Along-route geometry helpers for navigation-style marker/camera motion.
 * Uses the canonical Mapbox Directions polyline already fetched by the live map.
 */

export type LngLat = [number, number];

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(from: LngLat, to: LngLat): number {
  const lat1 = toRad(from[1]);
  const lat2 = toRad(to[1]);
  const dLon = toRad(to[0] - from[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Shortest signed delta from a → b in degrees (−180..180). */
export function shortestBearingDelta(fromDeg: number, toDeg: number): number {
  let d = ((toDeg - fromDeg + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

export function lerpBearing(fromDeg: number, toDeg: number, t: number): number {
  return (fromDeg + shortestBearingDelta(fromDeg, toDeg) * t + 360) % 360;
}

export function offsetLngLatMeters(
  point: LngLat,
  bearingDeg: number,
  distanceM: number
): LngLat {
  const R = 6371000;
  const br = toRad(bearingDeg);
  const lat1 = toRad(point[1]);
  const lng1 = toRad(point[0]);
  const angDist = distanceM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

function projectOnSegment(p: LngLat, a: LngLat, b: LngLat): { point: LngLat; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return { point: [a[0] + dx * t, a[1] + dy * t], t };
}

export type RouteSnap = {
  point: LngLat;
  segmentIndex: number;
  /** Distance along full route from start to snap (meters). */
  distanceAlongM: number;
  /** Perpendicular distance from raw GPS to route (meters). */
  offRouteM: number;
  /** Bearing of the snapped segment (travel direction). */
  segmentBearing: number;
};

function segmentLengths(route: LngLat[]): number[] {
  const lens: number[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    lens.push(haversineMeters(route[i]!, route[i + 1]!));
  }
  return lens;
}

export function snapToRoute(route: LngLat[], rider: LngLat): RouteSnap {
  if (route.length === 0) {
    return {
      point: rider,
      segmentIndex: 0,
      distanceAlongM: 0,
      offRouteM: 0,
      segmentBearing: 0,
    };
  }
  if (route.length === 1) {
    return {
      point: route[0]!,
      segmentIndex: 0,
      distanceAlongM: 0,
      offRouteM: haversineMeters(rider, route[0]!),
      segmentBearing: 0,
    };
  }

  const lens = segmentLengths(route);
  let bestPoint = route[0]!;
  let bestSeg = 0;
  let bestDist = Infinity;
  let bestT = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const { point, t } = projectOnSegment(rider, route[i]!, route[i + 1]!);
    const d = haversineMeters(rider, point);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = point;
      bestSeg = i;
      bestT = t;
    }
  }

  let along = 0;
  for (let i = 0; i < bestSeg; i++) along += lens[i] ?? 0;
  along += (lens[bestSeg] ?? 0) * bestT;

  const a = route[bestSeg]!;
  const b = route[bestSeg + 1]!;
  return {
    point: bestPoint,
    segmentIndex: bestSeg,
    distanceAlongM: along,
    offRouteM: bestDist,
    segmentBearing: bearingDegrees(a, b),
  };
}

/** Point at distance `alongM` from route start. */
export function pointAlongRoute(route: LngLat[], alongM: number): {
  point: LngLat;
  bearing: number;
} {
  if (route.length === 0) return { point: [0, 0], bearing: 0 };
  if (route.length === 1) return { point: route[0]!, bearing: 0 };

  let remaining = Math.max(0, alongM);
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const seg = haversineMeters(a, b);
    if (remaining <= seg || i === route.length - 2) {
      const t = seg < 1e-6 ? 0 : Math.min(1, remaining / seg);
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        bearing: bearingDegrees(a, b),
      };
    }
    remaining -= seg;
  }
  const last = route[route.length - 1]!;
  const prev = route[route.length - 2]!;
  return { point: last, bearing: bearingDegrees(prev, last) };
}

export function totalRouteLengthM(route: LngLat[]): number {
  let sum = 0;
  for (let i = 0; i < route.length - 1; i++) {
    sum += haversineMeters(route[i]!, route[i + 1]!);
  }
  return sum;
}

/** Remaining polyline from snap → end (for progress trim). */
export function remainingFromAlong(route: LngLat[], alongM: number): LngLat[] {
  if (route.length < 2) return route.length ? [...route] : [];
  const { point } = pointAlongRoute(route, alongM);
  const snap = snapToRoute(route, point);
  const remaining: LngLat[] = [snap.point, ...route.slice(snap.segmentIndex + 1)];
  if (remaining.length < 2) remaining.push(route[route.length - 1]!);
  return remaining;
}

/**
 * Map-match visual location: prefer route snap when close enough;
 * never yank hundreds of meters for cosmetics.
 */
export function resolveVisualRiderLocation(
  raw: LngLat,
  route: LngLat[] | null,
  maxSnapM = 80
): { visual: LngLat; matched: boolean; snap: RouteSnap | null } {
  if (!route || route.length < 2) {
    return { visual: raw, matched: false, snap: null };
  }
  const snap = snapToRoute(route, raw);
  if (snap.offRouteM <= maxSnapM) {
    return { visual: snap.point, matched: true, snap };
  }
  return { visual: raw, matched: false, snap };
}
