/**
 * Zomato-style dashed preview arc between pickup and drop (customer-app parity).
 * Coordinates are Mapbox [lng, lat]. Never returns a 2-point straight line.
 */

function haversineKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export function buildPickupDropPreviewArc(
  from: [number, number],
  to: [number, number],
  segments = 32
): [number, number][] {
  const spanKm = haversineKm(from[0], from[1], to[0], to[1]);
  // Guard continent-scale junk coords. Do not fall back to a straight line.
  if (!Number.isFinite(spanKm) || spanKm <= 0 || spanKm > 100) {
    return [];
  }
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const bulge = dist * 0.16;
  const control: [number, number] = [mid[0] + nx * bulge, mid[1] + ny * bulge];
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const u = 1 - t;
    points.push([
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ]);
  }
  return points;
}

/** True when Mapbox (or a fallback) produced a chord, not a road polyline. */
export function isLikelyStraightLineRoute(
  coords: [number, number][],
  chordMeters: number
): boolean {
  if (coords.length < 2) return true;
  if (chordMeters < 80) return false;
  if (coords.length <= 2) return true;
  return coords.length < 4 && chordMeters > 250;
}
