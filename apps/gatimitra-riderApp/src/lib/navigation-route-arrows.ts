import type { LatLng } from "@/src/services/maps/directions.service";
import { bearingDegrees } from "@/src/lib/navigation-route-progress";

export type ManeuverArrowFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { bearing: number; kind: string };
};

export type ManeuverArrowCollection = {
  type: "FeatureCollection";
  features: ManeuverArrowFeature[];
};

const TURN_MIN_DEG = 26;
const MERGE_MIN_M = 55;

function headingDelta(a: number, b: number): number {
  return Math.abs(((b - a + 540) % 360) - 180);
}

function distanceM(a: LatLng, b: LatLng): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Turn / diversion points on the route with bearing for white on-route arrows. */
export function buildManeuverArrowCollection(route: LatLng[]): ManeuverArrowCollection {
  const features: ManeuverArrowFeature[] = [];
  if (route.length < 3) {
    return { type: "FeatureCollection", features };
  }

  let lastArrowAt = route[0]!;

  for (let i = 1; i < route.length - 1; i++) {
    const prev = route[i - 1]!;
    const curr = route[i]!;
    const next = route[i + 1]!;
    const inBr = bearingDegrees(prev, curr);
    const outBr = bearingDegrees(curr, next);
    const delta = headingDelta(inBr, outBr);
    if (delta < TURN_MIN_DEG) continue;

    if (distanceM(lastArrowAt, curr) < MERGE_MIN_M) continue;

    const bearing = outBr;
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [curr.longitude, curr.latitude],
      },
      properties: { bearing, kind: delta >= 75 ? "sharp" : "turn" },
    });
    lastArrowAt = curr;
  }

  return { type: "FeatureCollection", features };
}
