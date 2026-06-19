import {
  resolveCanonicalRideRoute,
  type LatLng,
} from "@/services/directions.service";
import {
  buildRideRouteKey,
  logRideRouteDebug,
  type RideRouteSnapshot,
  type RideRouteStop,
} from "@/lib/ride-route-snapshot";
import { useRideRouteStore } from "@/store/rideRouteStore";

function canonicalEtaMinutes(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 60));
}

export function calculatedRouteToSnapshot(
  pickup: LatLng,
  drop: LatLng,
  stops: LatLng[],
  route: NonNullable<Awaited<ReturnType<typeof resolveCanonicalRideRoute>>>
): RideRouteSnapshot {
  const routeDistanceKm = Math.round(route.distanceKm * 1000) / 1000;
  const routeDistanceMeters = Math.round(routeDistanceKm * 1000);
  const routeDurationSeconds = route.durationSeconds;
  const routeEtaMinutes = canonicalEtaMinutes(routeDurationSeconds);

  return {
    pickupLat: pickup.latitude,
    pickupLng: pickup.longitude,
    dropLat: drop.latitude,
    dropLng: drop.longitude,
    stops: stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    routeDistanceMeters,
    routeDistanceKm,
    routeDurationSeconds,
    routeEtaMinutes,
    routePolyline: route.coordinates,
    routeSource: route.source,
    computedAt: Date.now(),
  };
}

export async function fetchAndStoreRideRoute(args: {
  pickup: LatLng;
  drop: LatLng;
  stops?: LatLng[];
  force?: boolean;
}): Promise<RideRouteSnapshot | null> {
  const stops = args.stops ?? [];
  const routeKey = buildRideRouteKey({
    pickupLat: args.pickup.latitude,
    pickupLng: args.pickup.longitude,
    dropLat: args.drop.latitude,
    dropLng: args.drop.longitude,
    stops: stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
  });

  const { routeKey: cachedKey, snapshot: cached } = useRideRouteStore.getState();
  if (!args.force && cached && cachedKey === routeKey) {
    logRideRouteDebug("cache_hit", {
      routeKey,
      routeDistanceKm: cached.routeDistanceKm,
      routeEtaMinutes: cached.routeEtaMinutes,
    });
    return cached;
  }

  const route = await resolveCanonicalRideRoute(args.pickup, stops, args.drop);
  if (!route) {
    logRideRouteDebug("resolve_failed", {
      pickup: args.pickup,
      drop: args.drop,
      stopCount: stops.length,
    });
    return null;
  }

  const snapshot = calculatedRouteToSnapshot(args.pickup, args.drop, stops, route);
  useRideRouteStore.getState().setRouteSnapshot(routeKey, snapshot);

  logRideRouteDebug("resolved", {
    routeKey,
    pickupLat: snapshot.pickupLat,
    pickupLng: snapshot.pickupLng,
    dropLat: snapshot.dropLat,
    dropLng: snapshot.dropLng,
    routeDistanceMeters: snapshot.routeDistanceMeters,
    routeDistanceKm: snapshot.routeDistanceKm,
    routeDurationSeconds: snapshot.routeDurationSeconds,
    routeEtaMinutes: snapshot.routeEtaMinutes,
    routeSource: snapshot.routeSource,
    fareDistanceKm: snapshot.routeDistanceKm,
    payoutDropDistanceKm: snapshot.routeDistanceKm,
  });

  return snapshot;
}

export function rideRouteParamsFromSnapshot(
  snapshot: RideRouteSnapshot
): Record<string, string> {
  return {
    tripKm: String(snapshot.routeDistanceKm),
    routeDistanceKm: String(snapshot.routeDistanceKm),
    routeDurationSeconds: String(snapshot.routeDurationSeconds),
    routeEtaMins: String(snapshot.routeEtaMinutes),
  };
}

export function parseRideRouteStops(stopsJson?: string): RideRouteStop[] {
  if (!stopsJson?.trim()) return [];
  try {
    const parsed = JSON.parse(stopsJson) as Array<{
      latitude?: number | null;
      longitude?: number | null;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          s.latitude != null &&
          s.longitude != null &&
          Number.isFinite(s.latitude) &&
          Number.isFinite(s.longitude)
      )
      .map((s) => ({ latitude: s.latitude!, longitude: s.longitude! }));
  } catch {
    return [];
  }
}
