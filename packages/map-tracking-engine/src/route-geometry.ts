/** Polyline projection helpers shared by progress + off-route modules. */

import { bearingDegrees, distanceMeters, headingDeltaDeg, type LatLng } from "./geo";

export { bearingDegrees, headingDeltaDeg, type LatLng };

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

export function closestPointOnRouteHelper(
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
