import { toMapLngLat } from '@/lib/parse-order-map-coords';

/** Match rider app: route lines attach slightly ahead of GPS along heading. */
export const RIDER_FRONT_WHEEL_OFFSET_M = 2;

export function bearingDegreesLngLat(from: [number, number], to: [number, number]): number {
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const dLon = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function offsetLngLatMeters(
  point: [number, number],
  bearingDeg: number,
  distanceM: number
): [number, number] {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (point[1] * Math.PI) / 180;
  const lng1 = (point[0] * Math.PI) / 180;
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

export function riderFrontWheelLngLat(
  gps: [number, number],
  opts: { headingDeg?: number | null; fallbackBearingDeg?: number }
): [number, number] {
  const heading =
    opts.headingDeg != null && Number.isFinite(opts.headingDeg)
      ? opts.headingDeg
      : (opts.fallbackBearingDeg ?? 0);
  return offsetLngLatMeters(gps, heading, RIDER_FRONT_WHEEL_OFFSET_M);
}

export function resolveRiderFrontWheelLngLat(input: {
  latitude: number;
  longitude: number;
  heading_degrees?: number | null;
  prevGps?: [number, number] | null;
  destination?: [number, number] | null;
  routeBearingDeg?: number | null;
}): [number, number] | null {
  const gps = toMapLngLat(input.latitude, input.longitude);
  if (!gps) return null;

  let fallback: number | undefined;
  if (input.routeBearingDeg != null && Number.isFinite(input.routeBearingDeg)) {
    fallback = input.routeBearingDeg;
  } else if (input.prevGps) {
    fallback = bearingDegreesLngLat(input.prevGps, gps);
  } else if (input.destination) {
    fallback = bearingDegreesLngLat(gps, input.destination);
  }

  return riderFrontWheelLngLat(gps, {
    headingDeg: input.heading_degrees,
    fallbackBearingDeg: fallback,
  });
}
