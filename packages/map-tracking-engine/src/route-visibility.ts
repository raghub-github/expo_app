/** When to hide the navigation polyline (arrived at *current* destination). */

export const NAV_ROUTE_HIDE_DISTANCE_M = 40;

/**
 * Hide road route only when the rider has essentially reached the **current**
 * navigation destination (pickup OR drop), never because a prior leg completed.
 */
export function shouldHideNavigationRoute(
  arrivedAtCurrentDestination: boolean,
  remainingDistanceM: number | null | undefined,
  hideWithinM: number = NAV_ROUTE_HIDE_DISTANCE_M
): boolean {
  if (arrivedAtCurrentDestination) return true;
  if (remainingDistanceM == null || !Number.isFinite(remainingDistanceM)) return false;
  return remainingDistanceM <= hideWithinM;
}

export function resolveRoadRouteCoordinates<T extends { latitude: number; longitude: number }>(
  remaining: T[],
  fullRoute: T[]
): T[] {
  if (remaining.length >= 2) return remaining;
  if (fullRoute.length >= 2) return fullRoute;
  return [];
}
