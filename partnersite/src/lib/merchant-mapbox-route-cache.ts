import { resolveRiderFrontWheelLngLat } from '@/lib/map-rider-route-anchor';
import { isValidLatLon, resolveStoreMapLngLat, toMapLngLat } from '@/lib/parse-order-map-coords';
import type { MerchantRiderTrackingPayload } from '@/lib/merchant-rider-tracking';

type RouteLineCoords = Array<[number, number]>;

const routeCache = new Map<string, RouteLineCoords>();
const inflight = new Map<string, Promise<RouteLineCoords | null>>();

function routeKey(from: [number, number], to: [number, number]): string {
  return `${from[0].toFixed(5)},${from[1].toFixed(5)}|${to[0].toFixed(5)},${to[1].toFixed(5)}`;
}

function getMapboxToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';
}

export function getCachedDrivingRoute(
  from: [number, number],
  to: [number, number]
): RouteLineCoords | null {
  return routeCache.get(routeKey(from, to)) ?? null;
}

export async function fetchAndCacheDrivingRoute(
  from: [number, number],
  to: [number, number]
): Promise<RouteLineCoords | null> {
  const key = routeKey(from, to);
  const hit = routeCache.get(key);
  if (hit?.length) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const token = getMapboxToken();
  if (!token) return null;

  const promise = (async () => {
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/` +
        `${from[0]},${from[1]};${to[0]},${to[1]}` +
        `?overview=full&geometries=geojson&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const json = (await res.json()) as {
        routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
      };
      const coords = json.routes?.[0]?.geometry?.coordinates;
      if (coords && coords.length >= 2) {
        routeCache.set(key, coords);
        return coords;
      }
    } catch {
      /* ignore */
    }
    return null;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** Warm Mapbox route while order is selected (before tracking modal opens). */
export function prefetchTrackingDrivingRoute(
  payload: MerchantRiderTrackingPayload | null,
  merchantStoreLat?: number | null,
  merchantStoreLon?: number | null
): void {
  if (!payload?.location || !isValidLatLon(payload.location.latitude, payload.location.longitude)) {
    return;
  }

  const storeLngLat =
    payload.store != null
      ? toMapLngLat(payload.store.latitude, payload.store.longitude)
      : resolveStoreMapLngLat({
          merchantLat: merchantStoreLat,
          merchantLon: merchantStoreLon,
          pickupLat: payload.pickup?.latitude,
          pickupLon: payload.pickup?.longitude,
        });

  if (!storeLngLat) return;

  const riderAnchor = resolveRiderFrontWheelLngLat({
    latitude: payload.location.latitude,
    longitude: payload.location.longitude,
    heading_degrees: payload.location.heading_degrees,
    destination: storeLngLat,
  });

  if (!riderAnchor) return;

  void fetchAndCacheDrivingRoute(riderAnchor, storeLngLat);
}
