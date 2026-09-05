import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
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
import {
  analyzeRiderOnRoute,
  rerouteDebounceMs,
  shouldAnalyzeOffRouteSample,
  shouldRequestReroute,
  trackDebug,
} from "@gatimitra/map-tracking-engine";

/** Bike profile for food delivery partner routes (not order id). */
const FOOD_DELIVERY_ROUTE_VEHICLE = "bike";

type LiveRouteState = {
  /** Full road polyline — remaining segment is trimmed before it reaches the native map. */
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
  riderHeading?: number | null;
}): LiveRouteState {
  const { phase, rider, pickup, drop, orderId, enabled = true, riderHeading } = args;
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
  }, [orderId]);

  const toLat = phase === "rider_to_drop" ? drop.latitude : pickup.latitude;
  const toLng = phase === "rider_to_drop" ? drop.longitude : pickup.longitude;

  const destKey = `${phase}|${toLat.toFixed(5)},${toLng.toFixed(5)}`;

  useEffect(() => {
    if (!enabled) {
      setRoute(null);
      hasRouteRef.current = false;
      setIsRefreshing(false);
      if (rerouteTimerRef.current) {
        clearTimeout(rerouteTimerRef.current);
        rerouteTimerRef.current = null;
      }
      return;
    }

    // Wait for a real rider fix — never build pickup→pickup placeholder routes.
    if (!rider) return;
    if (AppState.currentState !== "active") return;

    const destChanged = lastDestKeyRef.current !== destKey;
    lastDestKeyRef.current = destKey;

    // Initial route or destination / phase change — not every GPS tick.
    if (hasRouteRef.current && !destChanged) return;

    const from: MapLatLng = { latitude: rider.latitude, longitude: rider.longitude };
    const to: MapLatLng = { latitude: toLat, longitude: toLng };

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsRefreshing(true);

    void (async () => {
      let next =
        (await getCalculatedRouteCoordinates([from, to], FOOD_DELIVERY_ROUTE_VEHICLE, {
          skipCache: destChanged,
        })) ?? (await fetchBackendRouteFallback(from, to, destChanged));

      if (requestIdRef.current !== requestId) return;
      if (next) {
        setRoute(next);
        hasRouteRef.current = true;
        trackDebug("route_generated", {
          orderId,
          phase,
          points: next.coordinates.length,
          distanceKm: next.distanceKm,
        });
      }
      setIsRefreshing(false);
    })();
  }, [rider?.latitude, rider?.longitude, toLat, toLng, phase, enabled, destKey, orderId]);

  // Off-route → debounced reroute only (no per-tick route API).
  useEffect(() => {
    if (!enabled || !rider || !route?.coordinates?.length) return;
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
      orderId,
      offRouteM: Math.round(deviation.offRouteM),
      wrongWay: deviation.wrongWay,
    });

    const debounceMs = rerouteDebounceMs(deviation);
    trackDebug("rerouting_started", { orderId, debounceMs });

    rerouteTimerRef.current = setTimeout(() => {
      rerouteTimerRef.current = null;
      lastRerouteAtRef.current = Date.now();
      const from: MapLatLng = { latitude: rider.latitude, longitude: rider.longitude };
      const to: MapLatLng = { latitude: toLat, longitude: toLng };
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setIsRefreshing(true);
      void (async () => {
        const next =
          (await getCalculatedRouteCoordinates([from, to], FOOD_DELIVERY_ROUTE_VEHICLE, {
            skipCache: true,
          })) ?? (await fetchBackendRouteFallback(from, to, true));
        if (requestIdRef.current !== requestId) return;
        if (next) {
          setRoute(next);
          hasRouteRef.current = true;
          trackDebug("rerouting_completed", {
            orderId,
            points: next.coordinates.length,
            distanceKm: next.distanceKm,
          });
        }
        setIsRefreshing(false);
      })();
    }, debounceMs);
  }, [
    enabled,
    rider?.latitude,
    rider?.longitude,
    riderHeading,
    route?.coordinates,
    toLat,
    toLng,
    orderId,
  ]);

  useEffect(() => {
    return () => {
      if (rerouteTimerRef.current) {
        clearTimeout(rerouteTimerRef.current);
        rerouteTimerRef.current = null;
      }
    };
  }, [orderId, enabled]);

  const coordinates = route?.coordinates ?? [];
  const remainingCoordinates = useMemo(
    () => sliceRouteFromRider(coordinates, rider),
    [coordinates, rider?.latitude, rider?.longitude]
  );

  // Prefer live remaining distance along geometry (no new route call).
  const liveRemainingM = useMemo(() => {
    if (remainingCoordinates.length >= 2) {
      let sum = 0;
      for (let i = 1; i < remainingCoordinates.length; i++) {
        const a = remainingCoordinates[i - 1]!;
        const b = remainingCoordinates[i]!;
        sum += haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
      }
      return Math.round(sum);
    }
    if (route?.distanceKm != null && Number.isFinite(route.distanceKm)) {
      return Math.round(route.distanceKm * 1000);
    }
    return null;
  }, [remainingCoordinates, route?.distanceKm]);

  return {
    coordinates,
    remainingCoordinates,
    distanceM: liveRemainingM,
    etaMinutes:
      liveRemainingM != null
        ? Math.max(1, Math.round(liveRemainingM / 6.1 / 60))
        : (route?.etaMinutes ?? null),
    isRefreshing,
  };
}
