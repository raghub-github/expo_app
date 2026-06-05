import type { LatLng } from "@/src/services/maps/directions.service";
import { distanceMeters } from "@/src/services/maps/directions.service";
import { bearingDegrees, offsetPoint } from "@/src/lib/navigation-route-progress";

export const NAV_MIN_FIT_DELTA = 0.006;
export const NAV_CLOSE_DISTANCE_M = 200;
export const NAV_EXPANSION_M = 160;

export type MapEdgeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function buildNavigationFitPoints(
  pickup: LatLng,
  rider: LatLng | undefined,
  routePoints: LatLng[] = [],
  extraStops: LatLng[] = []
): LatLng[] {
  const pts: LatLng[] = [...routePoints, ...extraStops, pickup];
  if (rider) pts.push(rider);

  if (!rider) return pts;

  const dist = distanceMeters(rider, pickup);
  if (dist >= NAV_CLOSE_DISTANCE_M) return pts;

  const mid: LatLng = {
    latitude: (rider.latitude + pickup.latitude) / 2,
    longitude: (rider.longitude + pickup.longitude) / 2,
  };
  const br = dist > 3 ? bearingDegrees(rider, pickup) : 45;
  const expand = Math.max(NAV_EXPANSION_M, NAV_CLOSE_DISTANCE_M - dist + 80);

  pts.push(offsetPoint(mid, (br + 90) % 360, expand));
  pts.push(offsetPoint(mid, (br + 270) % 360, expand));
  pts.push(offsetPoint(mid, br, expand * 0.65));
  pts.push(offsetPoint(mid, (br + 180) % 360, expand * 0.65));

  return pts;
}

export function boundsFromPoints(points: LatLng[]): {
  sw: [number, number];
  ne: [number, number];
} {
  const lngs = points.map((p) => p.longitude);
  const lats = points.map((p) => p.latitude);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const lngPad = Math.max(0.0008, (maxLng - minLng) * 0.12);
  const latPad = Math.max(0.0008, (maxLat - minLat) * 0.12);

  return {
    sw: [minLng - lngPad, minLat - latPad],
    ne: [maxLng + lngPad, maxLat + latPad],
  };
}

export function navigationEdgePadding(edge: MapEdgeInsets): MapEdgeInsets {
  return {
    top: Math.max(edge.top, 150),
    left: Math.max(edge.left, 100),
    right: Math.max(edge.right, 100),
    bottom: Math.max(edge.bottom, 450),
  };
}
