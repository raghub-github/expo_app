/** Hide road route when rider has essentially reached the destination pin. */
export const NAV_ROUTE_HIDE_DISTANCE_M = 40;

export function shouldHideNavigationRoute(
  arrivedAtDestination: boolean,
  remainingDistanceM: number | null | undefined
): boolean {
  if (arrivedAtDestination) return true;
  if (remainingDistanceM == null || !Number.isFinite(remainingDistanceM)) return false;
  return remainingDistanceM <= NAV_ROUTE_HIDE_DISTANCE_M;
}

/** Only render polylines from real routing APIs — never a straight-line fallback. */
export function resolveRoadRouteCoordinates(
  remaining: { latitude: number; longitude: number }[],
  fullRoute: { latitude: number; longitude: number }[]
): { latitude: number; longitude: number }[] {
  if (remaining.length >= 2) return remaining;
  if (fullRoute.length >= 2) return fullRoute;
  return [];
}
