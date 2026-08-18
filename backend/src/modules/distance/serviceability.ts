/**
 * Route-distance serviceability (P3) — an OPTIONAL, feature-gated enhancement on top of
 * the existing air-radius model.
 *
 * Baseline (always): a store's `delivery_radius_km` is a geographic coverage circle —
 * serviceable iff haversine(store, drop) <= radius. This is unchanged and is decided by
 * the caller (`outOfRange`); this module only adds the OPTIONAL road-route constraint.
 *
 * When `enabled` is false (the production default), `resolveRouteServiceability` returns
 * `{ serviceable: true, reason: null }` so the caller's final decision reduces EXACTLY to
 * the air-radius model — byte-identical behavior. Turn it on per-environment to also require
 * a real road route within `radius * multiplier` (capped by an optional absolute max).
 */

export type RouteServiceabilityReason = "route_out_of_range" | "no_route";

export type RouteServiceabilityDecision = {
  serviceable: boolean;
  /** Route-specific reason, only set when `enabled` and the route constraint fails. */
  reason: RouteServiceabilityReason | null;
};

export type RouteServiceabilityInput = {
  /** Feature flag. Default OFF → no behavior change. */
  enabled: boolean;
  /** Skip entirely when the store has no usable coordinates (can't validate a route). */
  hasStoreCoords: boolean;
  /** Road-network distance (km) from the routing engine for store → drop. */
  routeDistanceKm: number;
  /** Routing source; "haversine" means Mapbox+OSRM both failed → no real road route. */
  routeSource: "mapbox" | "osrm" | "haversine";
  /** The store's effective service radius (km). */
  serviceRadiusKm: number;
  /** Operational multiplier applied to the radius (e.g. 1.5 for road detours). */
  multiplier: number;
  /** Optional absolute cap (km); the stricter of (radius*multiplier, this) wins. Null = none. */
  maxRouteDistanceKm: number | null;
};

/**
 * The maximum acceptable ROUTE distance for a given radius, i.e. the stricter of
 * `radius * multiplier` and the absolute cap. Exposed for tests / observability.
 */
export function maxRouteDistanceKmFor(
  serviceRadiusKm: number,
  multiplier: number,
  absoluteCapKm: number | null
): number {
  return Math.min(
    serviceRadiusKm * multiplier,
    absoluteCapKm ?? Number.POSITIVE_INFINITY
  );
}

export function resolveRouteServiceability(
  input: RouteServiceabilityInput
): RouteServiceabilityDecision {
  // OFF (default) or unverifiable store → do not add any constraint.
  if (!input.enabled || !input.hasStoreCoords) {
    return { serviceable: true, reason: null };
  }

  // No real road route could be computed → do not promise a delivery we cannot route.
  if (input.routeSource === "haversine") {
    return { serviceable: false, reason: "no_route" };
  }

  const maxRouteKm = maxRouteDistanceKmFor(
    input.serviceRadiusKm,
    input.multiplier,
    input.maxRouteDistanceKm
  );
  if (input.routeDistanceKm > maxRouteKm) {
    return { serviceable: false, reason: "route_out_of_range" };
  }

  return { serviceable: true, reason: null };
}
