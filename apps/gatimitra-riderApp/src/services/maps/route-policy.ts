/**
 * Pure, dependency-free route-selection policy shared by the rider navigation service and its
 * tests. Kept in lockstep with apps/customer_app/services/directions.service.ts so both apps draw
 * the same line for the same vehicle, and consistent with the backend fare basis (shortest road
 * distance). No React Native / Expo imports here so it can be unit-tested under node:test.
 */

export type RouteOptimizeFor = "fastest_time" | "shortest_distance";

/**
 * Per-vehicle route choice: 2-wheelers take the SHORTEST road route (they cut through small lanes
 * and it matches the backend's shortest-distance fare basis); cars / autos take the FASTEST
 * main-road route.
 */
export function optimizeForRideType(rideType?: string): RouteOptimizeFor {
  return rideType === "bike" || rideType === "bike-lite" ? "shortest_distance" : "fastest_time";
}

/**
 * Order two route options by a vehicle's policy.
 * shortest_distance -> smaller distance wins (tie: faster route).
 * fastest_time      -> faster route wins (tie: shorter distance).
 * Mirrors the customer app's compareRoutes.
 */
export function compareRouteByPolicy(
  a: { distanceKm: number; durationScaled: number },
  b: { distanceKm: number; durationScaled: number },
  optimizeFor: RouteOptimizeFor
): number {
  if (optimizeFor === "shortest_distance") {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.durationScaled - b.durationScaled;
  }
  if (a.durationScaled !== b.durationScaled) return a.durationScaled - b.durationScaled;
  return a.distanceKm - b.distanceKm;
}
