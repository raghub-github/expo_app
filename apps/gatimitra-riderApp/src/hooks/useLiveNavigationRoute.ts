import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getNavigationRouteToPickup,
  latLngFromRider,
  type LatLng,
  type NavigationRoute,
} from "@/src/services/maps/directions.service";
import {
  applyNavigationGpsSample,
  canStartRouteRequest,
  EMPTY_OFF_ROUTE_CONFIRMATION,
  isStaleRouteResponse,
  navLog,
  resolveNavigationRouteStatus,
  shouldReplaceInFlightRouteRequest,
  trackDebug,
  type NavigationGpsFix,
  type NavigationRouteStatus,
  type OffRouteConfirmationState,
} from "@gatimitra/map-tracking-engine";
import { mapLog } from "@/src/lib/map-debug";

export type LiveNavOrigin = {
  lat: number;
  lng: number;
  headingDeg?: number;
  speedMps?: number;
  accuracyM?: number;
  timestampMs?: number;
};

export type LiveNavDestination = {
  lat: number;
  lng: number;
};

export type LiveNavigationRouteState = {
  route: NavigationRoute | null;
  routeVersion: number;
  routeStatus: NavigationRouteStatus;
  routeLoading: boolean;
  routeError: boolean;
  isRerouting: boolean;
  isOffRoute: boolean;
  distanceToRouteM: number | null;
  arrived: boolean;
  retryRoute: () => void;
};

type RouteRequestReason =
  | "INITIAL"
  | "DESTINATION_CHANGED"
  | "OFF_ROUTE"
  | "RETRY"
  | "INVALID_ROUTE";

const RETRY_BASE_MS = 2_500;
const RETRY_MAX_MS = 12_000;
const NAV_HEARTBEAT_MS = 4_000;

function destKeyOf(dest: LiveNavDestination | null | undefined): string {
  if (!dest) return "";
  if (!Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) return "";
  if (dest.lat === 0 && dest.lng === 0) return "";
  return `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`;
}

function toGpsFix(origin: LiveNavOrigin): NavigationGpsFix {
  return {
    latitude: origin.lat,
    longitude: origin.lng,
    headingDeg: origin.headingDeg,
    speedMps: origin.speedMps,
    accuracyM: origin.accuracyM,
    timestampMs: origin.timestampMs ?? Date.now(),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Live Mapbox navigation: origin is always the latest GPS fix, destination stays
 * fixed for the current order phase. Recalculates only on confirmed off-route,
 * dest change, or retry — never on every GPS sample.
 */
export function useLiveNavigationRoute(args: {
  orderId: string;
  origin: LiveNavOrigin | null | undefined;
  destination: LiveNavDestination | null | undefined;
  rideType?: string;
  enabled?: boolean;
}): LiveNavigationRouteState {
  const { orderId, origin, destination, rideType, enabled = true } = args;

  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeVersion, setRouteVersion] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [confirmedOffRoute, setConfirmedOffRoute] = useState(false);
  const [distanceToRouteM, setDistanceToRouteM] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);

  const originRef = useRef(origin);
  originRef.current = origin;
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const routeRef = useRef(route);
  routeRef.current = route;
  const arrivedRef = useRef(arrived);
  arrivedRef.current = arrived;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const rideTypeRef = useRef(rideType);
  rideTypeRef.current = rideType;
  const routeVersionRef = useRef(0);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightOriginRef = useRef<LatLng | null>(null);
  const lastRerouteAtRef = useRef(0);
  const lastDestKeyRef = useRef("");
  const confirmationRef = useRef<OffRouteConfirmationState>(EMPTY_OFF_ROUTE_CONFIRMATION);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const heartbeatAtRef = useRef(0);
  const hasRequestedInitialRef = useRef(false);
  const scheduleRetryRef = useRef<(reason: RouteRequestReason) => void>(() => {});

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const requestRoute = useCallback(
    async (reason: RouteRequestReason) => {
      const navOrigin = originRef.current;
      const dest = destinationRef.current;
      const nowMs = Date.now();
      const hasOrigin = Boolean(navOrigin);
      const hasDestination = destKeyOf(dest).length > 0;

      if (
        !canStartRouteRequest({
          enabled: enabledRef.current,
          arrived: arrivedRef.current,
          hasOrigin,
          hasDestination,
          reason,
          lastRerouteAtMs: lastRerouteAtRef.current,
          nowMs,
        })
      ) {
        return;
      }

      if (!navOrigin || !dest) return;

      const currentOrigin = latLngFromRider(navOrigin.lat, navOrigin.lng);
      const replace = shouldReplaceInFlightRouteRequest({
        inFlight: abortRef.current != null,
        inFlightOrigin: inFlightOriginRef.current,
        currentOrigin,
        destChanged: reason === "DESTINATION_CHANGED",
      });
      if (!replace) return;

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      inFlightOriginRef.current = currentOrigin;
      if (reason === "OFF_ROUTE" || reason === "DESTINATION_CHANGED") {
        lastRerouteAtRef.current = nowMs;
      }

      const previousVersion = routeVersionRef.current;
      const hadRoute = (routeRef.current?.coordinates?.length ?? 0) >= 2;
      if (!hadRoute) setRouteLoading(true);
      setIsFetching(true);
      setRouteError(false);

      if (reason === "OFF_ROUTE") {
        navLog("REROUTE", {
          triggered: true,
          reason,
          currentLocation: currentOrigin,
          routeRequestId: requestId,
        });
        mapLog("ROUTE", { status: "REROUTED", reason: "OFF_ROUTE", version: previousVersion + 1 });
        trackDebug("rerouting_started", { orderId, requestId, reason });
      } else {
        mapLog("ROUTE", { status: "CALCULATING", reason, version: previousVersion });
        navLog("NAVIGATION", {
          currentLocation: currentOrigin,
          destination: { latitude: dest.lat, longitude: dest.lng },
          accuracy: navOrigin.accuracyM ?? null,
          reason,
          routeRequestId: requestId,
        });
      }

      try {
        const result = await getNavigationRouteToPickup(
          currentOrigin,
          latLngFromRider(dest.lat, dest.lng),
          rideTypeRef.current,
          { signal: abort.signal }
        );

        if (abort.signal.aborted || isStaleRouteResponse(requestId, requestIdRef.current)) {
          navLog("REROUTE", {
            routeRequestId: requestId,
            status: "DISCARDED_STALE",
            latestId: requestIdRef.current,
          });
          return;
        }

        if (result && result.coordinates.length >= 2) {
          const nextVersion = previousVersion + 1;
          routeVersionRef.current = nextVersion;
          setRoute(result);
          setRouteVersion(nextVersion);
          setRouteError(false);
          retryAttemptRef.current = 0;
          confirmationRef.current = EMPTY_OFF_ROUTE_CONFIRMATION;
          setConfirmedOffRoute(false);
          navLog("REROUTE", {
            routeVersion: nextVersion,
            status: "SUCCESS",
            reason,
          });
          navLog("ROUTE", {
            oldVersion: previousVersion,
            newVersion: nextVersion,
            action: "REPLACED",
            distance: result.distanceKm,
            eta: result.etaMinutes,
            points: result.coordinates.length,
          });
          mapLog("ROUTE", { status: "UPDATED", version: nextVersion, reason });
          trackDebug(reason === "OFF_ROUTE" ? "rerouting_completed" : "route_generated", {
            orderId,
            requestId,
            points: result.coordinates.length,
            distanceKm: result.distanceKm,
            reason,
          });
        } else {
          if (!hadRoute) setRouteError(true);
          navLog("REROUTE", { routeVersion: previousVersion, status: "EMPTY", reason });
          scheduleRetryRef.current(reason === "INITIAL" ? "RETRY" : "RETRY");
        }
      } catch (error) {
        if (isAbortError(error) || isStaleRouteResponse(requestId, requestIdRef.current)) {
          return;
        }
        if (!hadRoute) setRouteError(true);
        navLog("REROUTE", { routeVersion: previousVersion, status: "ERROR", reason });
        scheduleRetryRef.current("RETRY");
      } finally {
        if (requestId === requestIdRef.current) {
          abortRef.current = null;
          inFlightOriginRef.current = null;
          setIsFetching(false);
          setRouteLoading(false);
        }
      }
    },
    [orderId]
  );

  scheduleRetryRef.current = (reason: RouteRequestReason) => {
    if (arrivedRef.current || !enabledRef.current) return;
    clearRetryTimer();
    retryAttemptRef.current += 1;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * retryAttemptRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void requestRoute(reason);
    }, delay);
  };

  const retryRoute = useCallback(() => {
    retryAttemptRef.current = 0;
    clearRetryTimer();
    void requestRoute(routeRef.current ? "RETRY" : "INITIAL");
  }, [clearRetryTimer, requestRoute]);

  useEffect(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightOriginRef.current = null;
    lastRerouteAtRef.current = 0;
    lastDestKeyRef.current = "";
    confirmationRef.current = EMPTY_OFF_ROUTE_CONFIRMATION;
    retryAttemptRef.current = 0;
    hasRequestedInitialRef.current = false;
    routeVersionRef.current = 0;
    arrivedRef.current = false;
    clearRetryTimer();
    setRoute(null);
    setRouteVersion(0);
    setRouteLoading(false);
    setRouteError(false);
    setIsFetching(false);
    setConfirmedOffRoute(false);
    setDistanceToRouteM(null);
    setArrived(false);
  }, [orderId, clearRetryTimer]);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      clearRetryTimer();
      return;
    }

    const destKey = destKeyOf(destination);
    if (!destKey) return;

    const destChanged = lastDestKeyRef.current !== "" && lastDestKeyRef.current !== destKey;
    if (destChanged) {
      lastDestKeyRef.current = destKey;
      confirmationRef.current = EMPTY_OFF_ROUTE_CONFIRMATION;
      setConfirmedOffRoute(false);
      setArrived(false);
      arrivedRef.current = false;
      hasRequestedInitialRef.current = true;
      void requestRoute("DESTINATION_CHANGED");
      return;
    }

    if (lastDestKeyRef.current === "") {
      lastDestKeyRef.current = destKey;
    }

    if (!hasRequestedInitialRef.current && origin) {
      hasRequestedInitialRef.current = true;
      void requestRoute("INITIAL");
      return;
    }

    if (
      hasRequestedInitialRef.current &&
      origin &&
      abortRef.current &&
      inFlightOriginRef.current
    ) {
      const drifted = shouldReplaceInFlightRouteRequest({
        inFlight: true,
        inFlightOrigin: inFlightOriginRef.current,
        currentOrigin: { latitude: origin.lat, longitude: origin.lng },
        destChanged: false,
      });
      if (drifted) {
        void requestRoute("INITIAL");
      }
    }
  }, [enabled, destination?.lat, destination?.lng, origin?.lat, origin?.lng, requestRoute, clearRetryTimer]);

  useEffect(() => {
    if (!enabled || arrivedRef.current || !origin || !destination) return;
    if (destKeyOf(destination) === "") return;

    const location = toGpsFix(origin);
    const nowMs = location.timestampMs;
    const decision = applyNavigationGpsSample({
      route: route?.coordinates,
      destination: { latitude: destination.lat, longitude: destination.lng },
      location,
      confirmation: confirmationRef.current,
      nowMs,
    });
    confirmationRef.current = decision.next;
    setDistanceToRouteM(decision.deviation?.offRouteM ?? null);

    if (nowMs - heartbeatAtRef.current >= NAV_HEARTBEAT_MS) {
      heartbeatAtRef.current = nowMs;
      navLog("NAVIGATION", {
        currentLocation: { latitude: origin.lat, longitude: origin.lng },
        destination: { latitude: destination.lat, longitude: destination.lng },
        accuracy: origin.accuracyM ?? null,
        routeVersion: routeVersionRef.current,
      });
    }

    if (decision.arrived) {
      if (!arrivedRef.current) {
        arrivedRef.current = true;
        setArrived(true);
        abortRef.current?.abort();
        abortRef.current = null;
        clearRetryTimer();
        navLog("ARRIVAL", { destinationReached: true, routeVersion: routeVersionRef.current });
        trackDebug("navigation_arrived", { orderId });
      }
      setConfirmedOffRoute(false);
      return;
    }

    if (decision.potentiallyOffRoute) {
      const shouldLog =
        decision.confirmedOffRoute || nowMs - heartbeatAtRef.current >= 2_000;
      if (shouldLog) {
        navLog("OFF_ROUTE", {
          distanceToRoute: decision.deviation?.offRouteM ?? null,
          accuracy: origin.accuracyM ?? null,
          threshold: decision.thresholdM,
          confirmed: decision.confirmedOffRoute,
          reason: decision.reason,
        });
      }
    }

    setConfirmedOffRoute(decision.confirmedOffRoute);
    if (!decision.confirmedOffRoute) return;
    if (AppState.currentState !== "active") return;

    void requestRoute("OFF_ROUTE");
  }, [
    enabled,
    origin?.lat,
    origin?.lng,
    origin?.headingDeg,
    origin?.speedMps,
    origin?.accuracyM,
    origin?.timestampMs,
    destination?.lat,
    destination?.lng,
    route?.coordinates,
    requestRoute,
    clearRetryTimer,
    orderId,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  const hasRoute = (route?.coordinates?.length ?? 0) >= 2;
  const routeStatus = useMemo(
    () =>
      resolveNavigationRouteStatus({
        enabled,
        hasOrigin: Boolean(origin),
        hasDestination: destKeyOf(destination).length > 0,
        hasRoute,
        arrived,
        isFetching,
        confirmedOffRoute,
        fetchFailed: routeError,
      }),
    [enabled, origin, destination, hasRoute, arrived, isFetching, confirmedOffRoute, routeError]
  );

  return {
    route,
    routeVersion,
    routeStatus,
    routeLoading: routeLoading && !hasRoute,
    routeError: routeError && !hasRoute,
    isRerouting: routeStatus === "REROUTING",
    isOffRoute: routeStatus === "OFF_ROUTE" || routeStatus === "REROUTING",
    distanceToRouteM,
    arrived,
    retryRoute,
  };
}
