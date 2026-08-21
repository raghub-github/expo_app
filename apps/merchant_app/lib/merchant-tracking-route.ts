import type { MerchantMapPin, MerchantRiderTrackingPayload } from "@/services/riderTrackingApi";

export type LngLat = [number, number];

export function pinToLngLat(pin: MerchantMapPin | null | undefined): LngLat | null {
  if (!pin) return null;
  const lat = Number(pin.latitude);
  const lng = Number(pin.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lng, lat];
}

/** Rider → store while approaching; rider → customer after pickup. */
export function trackingRouteDestination(payload: MerchantRiderTrackingPayload): LngLat | null {
  const variant = payload.rider_display_variant ?? "on_the_way";
  if (variant === "picked_up" || variant === "delivered" || variant === "rto") {
    return pinToLngLat(payload.drop) ?? pinToLngLat(payload.store) ?? pinToLngLat(payload.pickup);
  }
  return pinToLngLat(payload.store) ?? pinToLngLat(payload.pickup) ?? pinToLngLat(payload.drop);
}

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const routeCache = new Map<string, LngLat[]>();

export async function fetchMerchantDrivingRoute(
  token: string,
  from: LngLat,
  to: LngLat
): Promise<LngLat[]> {
  if (haversineM(from, to) < 18) return [from, to];
  const key = `${from[0].toFixed(4)},${from[1].toFixed(4)}>${to[0].toFixed(4)},${to[1].toFixed(4)}`;
  const cached = routeCache.get(key);
  if (cached) return cached;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?overview=full&geometries=geojson&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as {
      routes?: { geometry?: { coordinates?: LngLat[] } }[];
    };
    const coords = json.routes?.[0]?.geometry?.coordinates;
    if (coords && coords.length >= 2) {
      routeCache.set(key, coords);
      return coords;
    }
  } catch {
    /* fall through */
  }
  const fallback: LngLat[] = [from, to];
  routeCache.set(key, fallback);
  return fallback;
}
