import { useEffect, useMemo, useRef, useState } from "react";
import {
  decodePolyline,
  getCalculatedRouteCoordinates,
  type CalculatedRoute,
} from "@/services/directions.service";
import { getRoute } from "@/services/distance.service";
import {
  haversineMeters,
  sliceRouteFromRider,
  type MapLatLng,
} from "@/lib/map-route-utils";
import type { FoodDeliveryMapPhase } from "@/lib/food-delivery-map-phase";

const ROUTE_REFETCH_METERS = 40;
const ROUTE_MAX_AGE_MS = 12_000;
/** Bike profile for food delivery partner routes (not order id). */
const FOOD_DELIVERY_ROUTE_VEHICLE = "bike";

type LiveRouteState = {
  /** Full road polyline — trimming happens in the map WebView for smooth animation. */
  coordinates: MapLatLng[];
  /** Remaining path from rider (for fit bounds / distance hints). */
  remainingCoordinates: MapLatLng[];
  distanceM: number | null;
  etaMinutes: number | null;
  isRefreshing: boolean;
};

async function fetchBackendRouteFallback(
  from: MapLatLng,
  to: MapLatLng,
  skipCache: boolean
): Promise<CalculatedRoute | null> {
  try {
    const result = await getRoute({
      origin: { lat: from.latitude, lng: from.longitude },
      destination: { lat: to.latitude, lng: to.longitude },
      profile: "bike",
      skipCache,
    });
    const encoded = result.geometry ?? result.polyline;
    if (!encoded?.trim()) return null;
    const coordinates = decodePolyline(encoded);
    if (coordinates.length < 2) return null;
    return {
      coordinates,
      distanceKm: result.distanceKm,
      durationSeconds: Math.max(1, Math.round(result.durationSeconds ?? result.etaMinutes * 60)),
      etaMinutes: result.etaMinutes,
      source: "backend",
      vehicleId: FOOD_DELIVERY_ROUTE_VEHICLE,
    };
  } catch {
    return null;
  }
}

export function useFoodDeliveryLiveRoute(args: {
  phase: FoodDeliveryMapPhase;
  rider: MapLatLng | null;
  pickup: MapLatLng;
  drop: MapLatLng;
  orderId: string;
  /** Skip routing API until a delivery partner is assigned. */
  enabled?: boolean;
}): LiveRouteState {
  const { phase, rider, pickup, drop, enabled = true } = args;
  const [route, setRoute] = useState<CalculatedRoute | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastOriginRef = useRef<MapLatLng | null>(null);
  const lastFetchAtRef = useRef(0);
  const hasRouteRef = useRef(false);
  const requestIdRef = useRef(0);

  const fromLat =
    phase === "rider_to_drop"
      ? (rider?.latitude ?? pickup.latitude)
      : (rider?.latitude ?? pickup.latitude);
  const fromLng =
    phase === "rider_to_drop"
      ? (rider?.longitude ?? pickup.longitude)
      : (rider?.longitude ?? pickup.longitude);
  const toLat = phase === "rider_to_drop" ? drop.latitude : pickup.latitude;
  const toLng = phase === "rider_to_drop" ? drop.longitude : pickup.longitude;

  useEffect(() => {
    if (!enabled) {
      setRoute(null);
      hasRouteRef.current = false;
      setIsRefreshing(false);
      return;
    }

    const from: MapLatLng = { latitude: fromLat, longitude: fromLng };
    const to: MapLatLng = { latitude: toLat, longitude: toLng };

    const now = Date.now();
    const movedEnough =
      lastOriginRef.current == null ||
      haversineMeters(from.latitude, from.longitude, lastOriginRef.current.latitude, lastOriginRef.current.longitude) >=
        ROUTE_REFETCH_METERS;
    const stale = now - lastFetchAtRef.current >= ROUTE_MAX_AGE_MS;

    if (!movedEnough && !stale && hasRouteRef.current) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsRefreshing(true);

    void (async () => {
      let next =
        (await getCalculatedRouteCoordinates([from, to], FOOD_DELIVERY_ROUTE_VEHICLE, {
          skipCache: stale,
        })) ?? (await fetchBackendRouteFallback(from, to, stale));

      if (requestIdRef.current !== requestId) return;
      if (next) {
        setRoute(next);
        hasRouteRef.current = true;
        lastOriginRef.current = from;
        lastFetchAtRef.current = Date.now();
      }
      setIsRefreshing(false);
    })();
  }, [fromLat, fromLng, toLat, toLng, phase, enabled]);

  const coordinates = route?.coordinates ?? [];
  const remainingCoordinates = useMemo(
    () => sliceRouteFromRider(coordinates, rider),
    [coordinates, rider]
  );

  const distanceM =
    route?.distanceKm != null && Number.isFinite(route.distanceKm)
      ? Math.round(route.distanceKm * 1000)
      : null;

  return {
    coordinates,
    remainingCoordinates,
    distanceM,
    etaMinutes: route?.etaMinutes ?? null,
    isRefreshing,
  };
}
