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

/**
 * Pass through screen-computed insets so the camera matches the real layout.
 * Legacy hard floors (e.g. bottom: 450) shrank the visible map to a blank strip.
 */
export function navigationEdgePadding(edge: MapEdgeInsets): MapEdgeInsets {
  return {
    top: Math.max(0, Math.round(edge.top)),
    left: Math.max(0, Math.round(edge.left)),
    right: Math.max(0, Math.round(edge.right)),
    bottom: Math.max(0, Math.round(edge.bottom)),
  };
}

type BuildNavMapEdgeInsetsInput = {
  safeTop: number;
  headerHeight?: number;
  /** Bottom sheet height when it overlays the map. */
  sheetOverlayHeight?: number;
  controlsReserve?: number;
};

/** Edge padding for header + overlay sheet + floating map controls. */
export function buildNavMapEdgeInsets({
  safeTop,
  headerHeight = 48,
  sheetOverlayHeight = 0,
  controlsReserve = 12,
}: BuildNavMapEdgeInsetsInput): MapEdgeInsets {
  return {
    top: safeTop + headerHeight + 8,
    bottom: sheetOverlayHeight + controlsReserve,
    left: 44,
    right: 60,
  };
}
