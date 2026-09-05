import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getCalculatedRouteCoordinates,
  type CalculatedRoute,
} from "@/services/directions.service";
import {
  haversineMeters,
  sliceRouteFromRider,
  type MapLatLng,
} from "@/lib/map-route-utils";
import {
  analyzeRiderOnRoute,
  resolveDisplayRiderPosition,
  rerouteDebounceMs,
  shouldAnalyzeOffRouteSample,
  shouldRequestReroute,
  trackDebug,
} from "@gatimitra/map-tracking-engine";

type LiveRouteState = {
  coordinates: MapLatLng[];
  fullCoordinates: MapLatLng[];
  distanceM: number | null;
  etaMinutes: number | null;
  isRefreshing: boolean;
  displayRider: MapLatLng | null;
};

export function useRiderToPickupLiveRoute(
  rider: MapLatLng | null,
  pickup: MapLatLng | null,
  rideId: string,
  riderHeading?: number | null
): LiveRouteState {
  const [route, setRoute] = useState<CalculatedRoute | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasRouteRef = useRef(false);
  const requestIdRef = useRef(0);
  const rerouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDestKeyRef = useRef<string>("");
  const lastRerouteAtRef = useRef(0);
  const lastOffRouteAnalyzeRef = useRef<{ lat: number; lng: number; atMs: number } | null>(
    null
  );

  useEffect(() => {
    hasRouteRef.current = false;
    lastDestKeyRef.current = "";
    setRoute(null);
  }, [rideId]);

  useEffect(() => {
    if (!rider || !pickup) {
      setRoute(null);
      hasRouteRef.current = false;
      return;
    }

    const destKey = `${pickup.latitude.toFixed(5)},${pickup.longitude.toFixed(5)}`;
    const destChanged = lastDestKeyRef.current !== destKey;
    lastDestKeyRef.current = destKey;

    if (hasRouteRef.current && !destChanged) return;
    if (AppState.currentState !== "active") return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsRefreshing(true);

    void getCalculatedRouteCoordinates([rider, pickup], rideId, {
      skipCache: destChanged,
    }).then((next) => {
      if (requestIdRef.current !== requestId) return;
      if (next) {
        setRoute(next);
        hasRouteRef.current = true;
        trackDebug("route_generated", {
          rideId,
          points: next.coordinates.length,
          distanceKm: next.distanceKm,
        });
      }
      setIsRefreshing(false);
    });
  }, [rider?.latitude, rider?.longitude, pickup?.latitude, pickup?.longitude, rideId]);

  useEffect(() => {
    if (!rider || !pickup || !route?.coordinates?.length) return;
    if (AppState.currentState !== "active") return;
    if (rerouteTimerRef.current) return;
    if (
      !shouldAnalyzeOffRouteSample(lastOffRouteAnalyzeRef.current, {
        latitude: rider.latitude,
        longitude: rider.longitude,
      })
    ) {
      return;
    }
    lastOffRouteAnalyzeRef.current = {
      lat: rider.latitude,
      lng: rider.longitude,
      atMs: Date.now(),
    };

    const deviation = analyzeRiderOnRoute(route.coordinates, {
      latitude: rider.latitude,
      longitude: rider.longitude,
      headingDeg: riderHeading ?? null,
    });
    if (!deviation?.shouldReroute) return;
    if (!shouldRequestReroute(deviation, lastRerouteAtRef.current)) return;

    trackDebug("off_route_detected", {
      rideId,
      offRouteM: Math.round(deviation.offRouteM),
      wrongWay: deviation.wrongWay,
    });

    const debounceMs = rerouteDebounceMs(deviation);
    trackDebug("rerouting_started", { rideId, debounceMs });

    rerouteTimerRef.current = setTimeout(() => {
      rerouteTimerRef.current = null;
      lastRerouteAtRef.current = Date.now();
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsRefreshing(true);
      void getCalculatedRouteCoordinates([rider, pickup], rideId, { skipCache: true }).then(
        (next) => {
          if (requestIdRef.current !== requestId) return;
          if (next) {
            setRoute(next);
            hasRouteRef.current = true;
            trackDebug("rerouting_completed", {
              rideId,
              points: next.coordinates.length,
              distanceKm: next.distanceKm,
            });
          }
          setIsRefreshing(false);
        }
      );
    }, debounceMs);
  }, [
    rider?.latitude,
    rider?.longitude,
    pickup?.latitude,
    pickup?.longitude,
    riderHeading,
    route?.coordinates,
    rideId,
  ]);

  useEffect(() => {
    return () => {
      if (rerouteTimerRef.current) {
        clearTimeout(rerouteTimerRef.current);
        rerouteTimerRef.current = null;
      }
    };
  }, [rideId]);

  const fullCoordinates = useMemo(() => route?.coordinates ?? [], [route?.coordinates]);

  const coordinates = useMemo(
    () => sliceRouteFromRider(fullCoordinates, rider),
    [fullCoordinates, rider?.latitude, rider?.longitude]
  );

  const distanceM = useMemo(() => {
    if (coordinates.length >= 2) {
      let sum = 0;
      for (let i = 1; i < coordinates.length; i++) {
        const a = coordinates[i - 1]!;
        const b = coordinates[i]!;
        sum += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
      }
      return Math.round(sum);
    }
    if (route?.distanceKm != null && Number.isFinite(route.distanceKm)) {
      return Math.round(route.distanceKm * 1000);
    }
    return null;
  }, [coordinates, route?.distanceKm]);

  return {
    coordinates,
    fullCoordinates,
    distanceM,
    etaMinutes:
      distanceM != null ? Math.max(1, Math.round(distanceM / 6.1 / 60)) : (route?.etaMinutes ?? null),
    isRefreshing,
    displayRider:
      rider && fullCoordinates.length >= 2
        ? resolveDisplayRiderPosition(fullCoordinates, {
            latitude: rider.latitude,
            longitude: rider.longitude,
            headingDeg: riderHeading ?? null,
          })
        : rider,
  };
}
