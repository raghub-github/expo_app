import { fetchAndCacheDrivingRoute } from '@/lib/merchant-mapbox-route-cache';
import type { MerchantRiderTrackingLocation } from '@/lib/merchant-rider-tracking';
import { resolveRiderFrontWheelLngLat } from '@/lib/map-rider-route-anchor';
import { toMapLngLat } from '@/lib/parse-order-map-coords';
import {
  coordsLngLatToRouteLatLng,
  etaMinutesFromMeters,
  remainingDistanceAlongRouteM,
} from '@/lib/route-remaining-distance';

export type MerchantRiderApproach = {
  remaining_distance_m: number;
  eta_minutes: number;
  /** straight-line fallback when route unavailable */
  source: 'route' | 'straight_line';
};

export async function computeMerchantRiderApproach(input: {
  location: MerchantRiderTrackingLocation;
  destinationLngLat: [number, number];
  prevTrailLngLat?: [number, number] | null;
}): Promise<MerchantRiderApproach | null> {
  const dest = input.destinationLngLat;
  const riderGps = toMapLngLat(input.location.latitude, input.location.longitude);
  if (!riderGps) return null;

  const riderAnchor =
    resolveRiderFrontWheelLngLat({
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      heading_degrees: input.location.heading_degrees,
      prevGps: input.prevTrailLngLat ?? null,
      destination: dest,
    }) ?? riderGps;

  const routeCoords = await fetchAndCacheDrivingRoute(riderAnchor, dest);
  if (routeCoords && routeCoords.length >= 2) {
    const route = coordsLngLatToRouteLatLng(routeCoords);
    const rider: { latitude: number; longitude: number; headingDeg?: number } = {
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      headingDeg: input.location.heading_degrees ?? undefined,
    };
    const remainingM = remainingDistanceAlongRouteM(route, rider);
    if (Number.isFinite(remainingM) && remainingM > 0) {
      return {
        remaining_distance_m: Math.round(remainingM),
        eta_minutes: etaMinutesFromMeters(remainingM),
        source: 'route',
      };
    }
  }

  const [rLng, rLat] = riderGps;
  const [dLng, dLat] = dest;
  const lat1 = (rLat * Math.PI) / 180;
  const lat2 = (dLat * Math.PI) / 180;
  const dLatR = lat2 - lat1;
  const dLngR = ((dLng - rLng) * Math.PI) / 180;
  const a =
    Math.sin(dLatR / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLngR / 2) ** 2;
  const straightM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (!Number.isFinite(straightM) || straightM <= 0) return null;

  return {
    remaining_distance_m: Math.round(straightM),
    eta_minutes: etaMinutesFromMeters(straightM),
    source: 'straight_line',
  };
}
