import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCalculatedRouteCoordinates,
  type CalculatedRoute,
} from "@/services/directions.service";
import {
  haversineMeters,
  sliceRouteFromRider,
  type MapLatLng,
} from "@/lib/map-route-utils";

const ROUTE_REFETCH_METERS = 40;
const ROUTE_MAX_AGE_MS = 12_000;

type LiveRouteState = {
  coordinates: MapLatLng[];
  distanceM: number | null;
  etaMinutes: number | null;
  isRefreshing: boolean;
};

export function useRiderToPickupLiveRoute(
  rider: MapLatLng | null,
  pickup: MapLatLng | null,
  rideId: string
): LiveRouteState {
  const [route, setRoute] = useState<CalculatedRoute | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastOriginRef = useRef<MapLatLng | null>(null);
  const lastFetchAtRef = useRef(0);
  const hasRouteRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!rider || !pickup) {
      setRoute(null);
      hasRouteRef.current = false;
      lastOriginRef.current = null;
      return;
    }

    const now = Date.now();
    const movedEnough =
      lastOriginRef.current == null ||
      haversineMeters(
        rider.latitude,
        rider.longitude,
        lastOriginRef.current.latitude,
        lastOriginRef.current.longitude
      ) >= ROUTE_REFETCH_METERS;
    const stale = now - lastFetchAtRef.current >= ROUTE_MAX_AGE_MS;

    if (!movedEnough && !stale && hasRouteRef.current) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsRefreshing(true);

    void getCalculatedRouteCoordinates([rider, pickup], rideId, { skipCache: stale }).then(
      (next) => {
        if (requestIdRef.current !== requestId) return;
        if (next) {
          setRoute(next);
          hasRouteRef.current = true;
          lastOriginRef.current = rider;
          lastFetchAtRef.current = Date.now();
        }
        setIsRefreshing(false);
      }
    );
  }, [rider?.latitude, rider?.longitude, pickup?.latitude, pickup?.longitude, rideId]);

  const coordinates = useMemo(
    () => sliceRouteFromRider(route?.coordinates ?? [], rider),
    [route?.coordinates, rider]
  );

  const distanceM =
    route?.distanceKm != null && Number.isFinite(route.distanceKm)
      ? Math.round(route.distanceKm * 1000)
      : null;

  return {
    coordinates,
    distanceM,
    etaMinutes: route?.etaMinutes ?? null,
    isRefreshing,
  };
}
