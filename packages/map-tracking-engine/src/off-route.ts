/**
 * Off-route detection + reroute thresholds.
 * Marker stays on real GPS — never snapped back onto the old polyline when off-route.
 */

import { lerpLatLng } from "./geo";
import {
  bearingDegrees,
  closestPointOnRouteHelper,
  headingDeltaDeg,
  type LatLng,
} from "./route-geometry";

export const OFF_ROUTE_REROUTE_M = 45;
export const OFF_ROUTE_SOFT_M = 18;
export const WRONG_WAY_MIN_HEADING_DELTA = 95;
export const REROUTE_DEBOUNCE_MS = 1800;
export const REROUTE_WRONG_WAY_DEBOUNCE_MS = 1400;

export type RiderOnRoute = LatLng & { headingDeg?: number | null };

export type RiderRouteDeviation = {
  offRouteM: number;
  snapPoint: LatLng;
  segmentIndex: number;
  routeBearingDeg: number;
  wrongWay: boolean;
  headingDeltaDeg: number;
  /** True when far enough to show off-route connector / orange styling. */
  visiblyOffRoute: boolean;
  /** True when a new road route should be requested. */
  shouldReroute: boolean;
};

export function analyzeRiderOnRoute(
  route: LatLng[],
  rider: RiderOnRoute
): RiderRouteDeviation | null {
  if (route.length < 2) return null;

  const { point: snap, segmentIndex, distanceM } = closestPointOnRouteHelper(route, rider);
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

  const visiblyOffRoute = distanceM >= OFF_ROUTE_SOFT_M;
  const shouldReroute =
    distanceM > OFF_ROUTE_REROUTE_M || (wrongWay && distanceM > 12);

  return {
    offRouteM: distanceM,
    snapPoint: snap,
    segmentIndex,
    routeBearingDeg: routeBearing,
    wrongWay,
    headingDeltaDeg: delta,
    visiblyOffRoute,
    shouldReroute,
  };
}

export function rerouteDebounceMs(deviation: RiderRouteDeviation): number {
  return deviation.wrongWay ? REROUTE_WRONG_WAY_DEBOUNCE_MS : REROUTE_DEBOUNCE_MS;
}

/**
 * On-route: keep the vehicle on the road polyline.
 * Off-route: return real GPS — never snap back onto the old route.
 */
export function resolveDisplayRiderPosition(
  route: LatLng[],
  rider: RiderOnRoute
): LatLng {
  const deviation = analyzeRiderOnRoute(route, rider);
  if (!deviation) return { latitude: rider.latitude, longitude: rider.longitude };
  if (deviation.visiblyOffRoute) {
    return { latitude: rider.latitude, longitude: rider.longitude };
  }
  // Soft blend near the road so GPS noise does not jitter off the line.
  const t = Math.min(1, Math.max(0.55, 1 - deviation.offRouteM / OFF_ROUTE_SOFT_M));
  return lerpLatLng(rider, deviation.snapPoint, t);
}
