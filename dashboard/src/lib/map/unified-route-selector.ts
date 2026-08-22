/**
 * Unified route selector for Live Rider Map — mirrors backend distance.service
 * `pickBestRoute` (bike = shortest practical distance among Mapbox alternatives).
 *
 * Does NOT invent geometry. Only selects among Mapbox-returned candidates.
 * Never rejects tunnels/underpasses/bridges — Mapbox validity is the gate.
 */

export type RoutingOptimizeFor = "shortest_distance" | "fastest_time";

export type MapboxRouteCandidate = {
  distance?: number;
  duration?: number;
  geometry?: { type?: string; coordinates?: [number, number][] };
  legs?: unknown[];
};

export type SelectedRouteResult = {
  route: MapboxRouteCandidate;
  routeIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  candidates: Array<{
    index: number;
    distanceMeters: number;
    durationSeconds: number;
    selected: boolean;
    rejectedReason?: string;
  }>;
  diagnostic: {
    mapboxProfile: string;
    optimizeFor: RoutingOptimizeFor;
    shortestCandidateDistance: number;
    selectedRouteDistance: number;
    differenceKm: number;
    differencePercent: number;
    anomaly: boolean;
  };
};

/** Prefer shortest over Mapbox default when detour exceeds these thresholds. */
export const MAX_ROUTE_DIFFERENCE_KM = 2.0;
export const MAX_ROUTE_DIFFERENCE_PERCENT = 15;

/** Food / two-wheeler live tracking — same as backend profile "bike". */
export const LIVE_RIDER_MAP_OPTIMIZE: RoutingOptimizeFor = "shortest_distance";
export const LIVE_RIDER_MAP_PROFILE = "driving";

export function selectShortestPracticalRoute(
  routes: MapboxRouteCandidate[] | undefined,
  optimizeFor: RoutingOptimizeFor = LIVE_RIDER_MAP_OPTIMIZE,
  mapboxProfile: string = LIVE_RIDER_MAP_PROFILE
): SelectedRouteResult | null {
  if (!routes?.length) return null;

  const candidates = routes
    .map((route, index) => {
      const distanceMeters = Number(route.distance);
      const durationSeconds = Number(route.duration);
      const coords = route.geometry?.coordinates;
      const hasGeometry = Array.isArray(coords) && coords.length >= 2;
      const valid =
        Number.isFinite(distanceMeters) &&
        distanceMeters > 0 &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0 &&
        hasGeometry;
      return {
        index,
        route,
        distanceMeters,
        durationSeconds,
        valid,
        rejectedReason: valid
          ? undefined
          : !hasGeometry
            ? "missing_or_empty_geometry"
            : "invalid_distance_or_duration",
      };
    })
    .filter((c) => c.valid);

  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (optimizeFor === "shortest_distance") {
      const dist = a.distanceMeters - b.distanceMeters;
      if (dist !== 0) return dist;
      return a.durationSeconds - b.durationSeconds;
    }
    const dur = a.durationSeconds - b.durationSeconds;
    if (dur !== 0) return dur;
    return a.distanceMeters - b.distanceMeters;
  });

  const best = sorted[0]!;
  const shortest = [...candidates].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]!;
  const differenceKm = (best.distanceMeters - shortest.distanceMeters) / 1000;
  const differencePercent =
    shortest.distanceMeters > 0
      ? ((best.distanceMeters - shortest.distanceMeters) / shortest.distanceMeters) * 100
      : 0;

  // Detour guard: if "fastest" pick is much longer than shortest valid, reconsider.
  let selected = best;
  let anomaly = false;
  if (
    optimizeFor === "fastest_time" &&
    (differenceKm > MAX_ROUTE_DIFFERENCE_KM || differencePercent > MAX_ROUTE_DIFFERENCE_PERCENT)
  ) {
    anomaly = true;
    selected = shortest;
  } else if (
    optimizeFor === "shortest_distance" &&
    best.index !== shortest.index
  ) {
    // Should not happen for shortest_distance — log as anomaly if it does.
    anomaly = true;
    selected = shortest;
  }

  const candidateLog = routes.map((route, index) => {
    const match = candidates.find((c) => c.index === index);
    if (!match) {
      return {
        index,
        distanceMeters: Number(route.distance) || 0,
        durationSeconds: Number(route.duration) || 0,
        selected: false,
        rejectedReason: "invalid_candidate",
      };
    }
    return {
      index,
      distanceMeters: match.distanceMeters,
      durationSeconds: match.durationSeconds,
      selected: match.index === selected.index,
      rejectedReason:
        match.index === selected.index
          ? undefined
          : optimizeFor === "shortest_distance"
            ? "longer_than_shortest_valid"
            : "slower_or_longer_than_selected",
    };
  });

  return {
    route: selected.route,
    routeIndex: selected.index,
    distanceMeters: selected.distanceMeters,
    durationSeconds: selected.durationSeconds,
    candidates: candidateLog,
    diagnostic: {
      mapboxProfile,
      optimizeFor,
      shortestCandidateDistance: shortest.distanceMeters,
      selectedRouteDistance: selected.distanceMeters,
      differenceKm: Math.round(differenceKm * 1000) / 1000,
      differencePercent: Math.round(differencePercent * 10) / 10,
      anomaly,
    },
  };
}

export function logRouteSelectionDiagnostic(
  label: string,
  from: [number, number],
  to: [number, number],
  result: SelectedRouteResult | null
) {
  if (!result) {
    console.warn(`[${label}] no valid Mapbox route`, {
      pickup_lon: from[0],
      pickup_lat: from[1],
      drop_lon: to[0],
      drop_lat: to[1],
    });
    return;
  }
  console.info(`[${label}] route selection`, {
    pickup_lon: from[0],
    pickup_lat: from[1],
    drop_lon: to[0],
    drop_lat: to[1],
    mapboxProfile: result.diagnostic.mapboxProfile,
    optimizeFor: result.diagnostic.optimizeFor,
    candidates: result.candidates.map((c) => ({
      index: c.index,
      distanceKm: Math.round((c.distanceMeters / 1000) * 100) / 100,
      durationMin: Math.round((c.durationSeconds / 60) * 10) / 10,
      selected: c.selected,
      rejectedReason: c.rejectedReason,
    })),
    shortestCandidateDistanceKm:
      Math.round((result.diagnostic.shortestCandidateDistance / 1000) * 100) / 100,
    selectedRouteDistanceKm:
      Math.round((result.diagnostic.selectedRouteDistance / 1000) * 100) / 100,
    differenceKm: result.diagnostic.differenceKm,
    differencePercent: result.diagnostic.differencePercent,
    anomaly: result.diagnostic.anomaly,
  });
}
