/**
 * Off-route detection + reroute thresholds.
 * Marker stays on real GPS — never snapped back onto the old polyline when off-route.
 */

import { distanceMeters, lerpLatLng } from "./geo";
import {
  bearingDegrees,
  closestPointOnRouteHelper,
  headingDeltaDeg,
  type LatLng,
} from "./route-geometry";

export const OFF_ROUTE_REROUTE_M = 45;
export const OFF_ROUTE_SOFT_M = 18;
export const WRONG_WAY_MIN_HEADING_DELTA = 95;
/** Wrong-way only counts once GPS is clearly off the road (not 12 m jitter). */
export const WRONG_WAY_REROUTE_M = 28;
/** Skip reroute when remaining path is this short — GPS noise at the pin. */
export const NEAR_DESTINATION_SKIP_REROUTE_M = 90;
export const REROUTE_DEBOUNCE_MS = 4000;
export const REROUTE_WRONG_WAY_DEBOUNCE_MS = 3500;
/** Hard floor between Directions requests (stops identical-route loops). */
export const REROUTE_COOLDOWN_MS = 12_000;

export type RiderOnRoute = LatLng & { headingDeg?: number | null };

export type RiderRouteDeviation = {
  offRouteM: number;
  snapPoint: LatLng;
  segmentIndex: number;
  routeBearingDeg: number;
  wrongWay: boolean;
  headingDeltaDeg: number;
  remainingDistanceM: number;
  /** True when far enough to show off-route connector / orange styling. */
  visiblyOffRoute: boolean;
  /** True when a new road route should be requested. */
  shouldReroute: boolean;
};

function remainingDistanceAlongRoute(
  route: LatLng[],
  snap: LatLng,
  segmentIndex: number
): number {
  if (route.length < 2) return 0;
  const segEnd = route[Math.min(segmentIndex + 1, route.length - 1)]!;
  let sum = distanceMeters(snap, segEnd);
  for (let i = segmentIndex + 1; i < route.length - 1; i++) {
    sum += distanceMeters(route[i]!, route[i + 1]!);
  }
  return sum;
}

export function analyzeRiderOnRoute(
  route: LatLng[],
  rider: RiderOnRoute
): RiderRouteDeviation | null {
  if (route.length < 2) return null;

  const { point: snap, segmentIndex, distanceM } = closestPointOnRouteHelper(route, rider);
  const segEnd = route[Math.min(segmentIndex + 1, route.length - 1)]!;
  const segStart = route[segmentIndex]!;
  const routeBearing = bearingDegrees(segStart, segEnd);
  const remainingDistanceM = remainingDistanceAlongRoute(route, snap, segmentIndex);

  let wrongWay = false;
  let delta = 0;

  if (rider.headingDeg != null && Number.isFinite(rider.headingDeg)) {
    delta = headingDeltaDeg(rider.headingDeg, routeBearing);
    // Stationary GPS heading is noisy — require a real gap from the polyline.
    wrongWay = delta >= WRONG_WAY_MIN_HEADING_DELTA && distanceM >= 12;
  } else if (distanceM >= 12) {
    const towardSnap = bearingDegrees(rider, snap);
    delta = headingDeltaDeg(towardSnap, routeBearing);
    wrongWay = delta >= 75 && delta <= 105;
  }

  const visiblyOffRoute = distanceM >= OFF_ROUTE_SOFT_M;
  const nearDestination = remainingDistanceM <= NEAR_DESTINATION_SKIP_REROUTE_M;
  const shouldReroute =
    !nearDestination &&
    (distanceM > OFF_ROUTE_REROUTE_M || (wrongWay && distanceM > WRONG_WAY_REROUTE_M));

  return {
    offRouteM: distanceM,
    snapPoint: snap,
    segmentIndex,
    routeBearingDeg: routeBearing,
    wrongWay,
    headingDeltaDeg: delta,
    remainingDistanceM,
    visiblyOffRoute,
    shouldReroute,
  };
}

export function rerouteDebounceMs(deviation: RiderRouteDeviation): number {
  return deviation.wrongWay ? REROUTE_WRONG_WAY_DEBOUNCE_MS : REROUTE_DEBOUNCE_MS;
}

/**
 * Gate Directions refetch: engine `shouldReroute` plus a cooldown so GPS jitter
 * cannot hammer Mapbox / OSRM while standing at the destination pin.
 */
export function shouldRequestReroute(
  deviation: RiderRouteDeviation | null | undefined,
  lastRerouteAtMs: number,
  nowMs = Date.now()
): boolean {
  if (!deviation?.shouldReroute) return false;
  if (nowMs - lastRerouteAtMs < REROUTE_COOLDOWN_MS) return false;
  return true;
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
