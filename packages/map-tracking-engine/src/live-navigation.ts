/**
 * Live navigation engine: GPS-origin routing, off-route confirmation,
 * arrival, and stale-response protection. Routing requests stay off the GPS tick.
 */

import { distanceMeters, type LatLng } from "./geo";
import {
  analyzeRiderOnRoute,
  NEAR_DESTINATION_SKIP_REROUTE_M,
  OFF_ROUTE_REROUTE_M,
  type RiderOnRoute,
  type RiderRouteDeviation,
} from "./off-route";

export type NavigationRouteStatus =
  | "IDLE"
  | "CALCULATING"
  | "NAVIGATING"
  | "OFF_ROUTE"
  | "REROUTING"
  | "ROUTE_ERROR"
  | "ARRIVED";

export type NavigationGpsFix = LatLng & {
  headingDeg?: number | null;
  speedMps?: number | null;
  accuracyM?: number | null;
  timestampMs: number;
};

export type NavigationDestination = LatLng;

export const OFF_ROUTE_ACCURACY_BUFFER_M = 12;
export const OFF_ROUTE_POOR_ACCURACY_M = 80;
export const OFF_ROUTE_CONFIRM_SAMPLES = 3;
export const OFF_ROUTE_CONFIRM_MIN_MS = 2200;
export const OFF_ROUTE_CONFIRM_MIN_MOVE_M = 16;
export const PARALLEL_HEADING_MAX_DELTA_DEG = 38;
export const PARALLEL_CONFIRM_SAMPLES = 5;
export const PARALLEL_CONFIRM_MIN_MS = 4000;
export const PARALLEL_CONFIRM_MIN_MOVE_M = 32;
export const CLEAR_OFF_ROUTE_MULTIPLIER = 2.1;
export const REROUTE_MIN_INTERVAL_MS = 8_000;
export const IN_FLIGHT_ORIGIN_REPLACE_M = 80;
export const ARRIVAL_BASE_M = 32;
export const ARRIVAL_CONFIRM_SAMPLES = 2;
export const HEADING_TRUST_MIN_SPEED_MPS = 1.4;

export type OffRouteConfirmationState = {
  consecutiveOffRoute: number;
  firstOffRouteAtMs: number | null;
  firstOffRouteLocation: LatLng | null;
  consecutiveArrival: number;
  lastSampleAtMs: number;
};

export const EMPTY_OFF_ROUTE_CONFIRMATION: OffRouteConfirmationState = {
  consecutiveOffRoute: 0,
  firstOffRouteAtMs: null,
  firstOffRouteLocation: null,
  consecutiveArrival: 0,
  lastSampleAtMs: 0,
};

export function offRouteThresholdM(accuracyM?: number | null): number {
  const accuracy =
    accuracyM != null && Number.isFinite(accuracyM) ? Math.max(0, accuracyM) : 0;
  return Math.max(OFF_ROUTE_REROUTE_M, accuracy + OFF_ROUTE_ACCURACY_BUFFER_M);
}

export function isGpsTooPoorForOffRoute(accuracyM?: number | null): boolean {
  return accuracyM != null && Number.isFinite(accuracyM) && accuracyM > OFF_ROUTE_POOR_ACCURACY_M;
}

export function arrivalThresholdM(accuracyM?: number | null): number {
  const accuracy =
    accuracyM != null && Number.isFinite(accuracyM) ? Math.max(0, accuracyM) : 10;
  return Math.max(ARRIVAL_BASE_M, accuracy * 1.15);
}

export function isStaleRouteResponse(responseId: number, latestId: number): boolean {
  return responseId !== latestId;
}

export function shouldReplaceInFlightRouteRequest(args: {
  inFlight: boolean;
  inFlightOrigin: LatLng | null;
  currentOrigin: LatLng;
  destChanged: boolean;
}): boolean {
  if (args.destChanged) return true;
  if (!args.inFlight) return true;
  if (!args.inFlightOrigin) return true;
  return distanceMeters(args.inFlightOrigin, args.currentOrigin) >= IN_FLIGHT_ORIGIN_REPLACE_M;
}

export type OffRouteSampleDecision = {
  next: OffRouteConfirmationState;
  deviation: RiderRouteDeviation | null;
  thresholdM: number;
  potentiallyOffRoute: boolean;
  confirmedOffRoute: boolean;
  arrived: boolean;
  reason: string;
};

function headingLooksParallel(
  deviation: RiderRouteDeviation,
  speedMps?: number | null
): boolean {
  const speedOk = speedMps != null && speedMps >= HEADING_TRUST_MIN_SPEED_MPS;
  if (!speedOk) return false;
  return deviation.headingDeltaDeg < PARALLEL_HEADING_MAX_DELTA_DEG && !deviation.wrongWay;
}

export function applyNavigationGpsSample(args: {
  route: LatLng[] | null | undefined;
  destination: NavigationDestination | null | undefined;
  location: NavigationGpsFix;
  confirmation: OffRouteConfirmationState;
  nowMs?: number;
}): OffRouteSampleDecision {
  const nowMs = args.nowMs ?? args.location.timestampMs;
  const thresholdM = offRouteThresholdM(args.location.accuracyM);
  const resetOff: OffRouteConfirmationState = {
    ...args.confirmation,
    consecutiveOffRoute: 0,
    firstOffRouteAtMs: null,
    firstOffRouteLocation: null,
    lastSampleAtMs: nowMs,
  };

  if (!args.destination) {
    return {
      next: { ...EMPTY_OFF_ROUTE_CONFIRMATION, lastSampleAtMs: nowMs },
      deviation: null,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived: false,
      reason: "NO_DESTINATION",
    };
  }

  const distToDest = distanceMeters(args.location, args.destination);
  const arrivalM = arrivalThresholdM(args.location.accuracyM);
  const gpsPoor = isGpsTooPoorForOffRoute(args.location.accuracyM);

  if (!gpsPoor && distToDest <= arrivalM) {
    const consecutiveArrival = args.confirmation.consecutiveArrival + 1;
    const arrived = consecutiveArrival >= ARRIVAL_CONFIRM_SAMPLES;
    return {
      next: {
        consecutiveOffRoute: 0,
        firstOffRouteAtMs: null,
        firstOffRouteLocation: null,
        consecutiveArrival,
        lastSampleAtMs: nowMs,
      },
      deviation: null,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived,
      reason: arrived ? "ARRIVED" : "NEAR_DESTINATION",
    };
  }

  const arrivalReset: OffRouteConfirmationState = {
    ...args.confirmation,
    consecutiveArrival: 0,
    lastSampleAtMs: nowMs,
  };

  if (!args.route || args.route.length < 2) {
    return {
      next: arrivalReset,
      deviation: null,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived: false,
      reason: "NO_ROUTE",
    };
  }

  const rider: RiderOnRoute = {
    latitude: args.location.latitude,
    longitude: args.location.longitude,
    headingDeg: args.location.headingDeg,
  };
  const deviation = analyzeRiderOnRoute(args.route, rider);
  if (!deviation) {
    return {
      next: arrivalReset,
      deviation: null,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived: false,
      reason: "NO_DEVIATION",
    };
  }

  if (gpsPoor) {
    return {
      next: arrivalReset,
      deviation,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived: false,
      reason: "POOR_ACCURACY",
    };
  }

  if (deviation.remainingDistanceM <= NEAR_DESTINATION_SKIP_REROUTE_M) {
    return {
      next: { ...resetOff, consecutiveArrival: 0 },
      deviation,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived: false,
      reason: "NEAR_DESTINATION_SKIP",
    };
  }

  const farFromPolyline = deviation.offRouteM > thresholdM;
  const clearlyWrongWay =
    deviation.wrongWay && deviation.offRouteM > Math.max(28, thresholdM * 0.7);
  const potentiallyOffRoute = farFromPolyline || clearlyWrongWay;

  if (!potentiallyOffRoute) {
    return {
      next: { ...resetOff, consecutiveArrival: 0 },
      deviation,
      thresholdM,
      potentiallyOffRoute: false,
      confirmedOffRoute: false,
      arrived: false,
      reason: "ON_ROUTE",
    };
  }

  const firstOffRouteLocation = args.confirmation.firstOffRouteLocation ?? args.location;
  const firstOffRouteAtMs = args.confirmation.firstOffRouteAtMs ?? nowMs;
  const consecutiveOffRoute = args.confirmation.consecutiveOffRoute + 1;
  const moveM = distanceMeters(firstOffRouteLocation, args.location);
  const elapsedMs = nowMs - firstOffRouteAtMs;
  const parallel = headingLooksParallel(deviation, args.location.speedMps);
  const clearlyFar = deviation.offRouteM > thresholdM * CLEAR_OFF_ROUTE_MULTIPLIER;

  const neededSamples = parallel && !clearlyFar ? PARALLEL_CONFIRM_SAMPLES : OFF_ROUTE_CONFIRM_SAMPLES;
  const neededMs = parallel && !clearlyFar ? PARALLEL_CONFIRM_MIN_MS : OFF_ROUTE_CONFIRM_MIN_MS;
  const neededMove = parallel && !clearlyFar ? PARALLEL_CONFIRM_MIN_MOVE_M : OFF_ROUTE_CONFIRM_MIN_MOVE_M;

  const confirmedOffRoute =
    (consecutiveOffRoute >= neededSamples && (elapsedMs >= neededMs || moveM >= neededMove)) ||
    (clearlyFar && consecutiveOffRoute >= 2 && elapsedMs >= 1_200);

  const reason = confirmedOffRoute
    ? parallel && !clearlyFar
      ? "OFF_ROUTE_PARALLEL_CONFIRMED"
      : "OFF_ROUTE"
    : parallel
      ? "OFF_ROUTE_PENDING_PARALLEL"
      : "OFF_ROUTE_PENDING";

  return {
    next: {
      consecutiveOffRoute,
      firstOffRouteAtMs,
      firstOffRouteLocation,
      consecutiveArrival: 0,
      lastSampleAtMs: nowMs,
    },
    deviation,
    thresholdM,
    potentiallyOffRoute: true,
    confirmedOffRoute,
    arrived: false,
    reason,
  };
}

export function resolveNavigationRouteStatus(input: {
  enabled: boolean;
  hasOrigin: boolean;
  hasDestination: boolean;
  hasRoute: boolean;
  arrived: boolean;
  isFetching: boolean;
  confirmedOffRoute: boolean;
  fetchFailed: boolean;
}): NavigationRouteStatus {
  if (!input.enabled || !input.hasDestination) return "IDLE";
  if (input.arrived) return "ARRIVED";
  if (input.isFetching && !input.hasRoute) return "CALCULATING";
  if (input.isFetching && input.hasRoute) return "REROUTING";
  if (input.confirmedOffRoute && input.hasRoute) return "OFF_ROUTE";
  if (input.hasRoute) return "NAVIGATING";
  if (input.fetchFailed) return "ROUTE_ERROR";
  if (input.hasOrigin) return "CALCULATING";
  return "IDLE";
}

export function canStartRouteRequest(args: {
  enabled: boolean;
  arrived: boolean;
  hasOrigin: boolean;
  hasDestination: boolean;
  reason: "INITIAL" | "DESTINATION_CHANGED" | "OFF_ROUTE" | "RETRY" | "INVALID_ROUTE";
  lastRerouteAtMs: number;
  nowMs: number;
}): boolean {
  if (!args.enabled || args.arrived) return false;
  if (!args.hasOrigin || !args.hasDestination) return false;
  if (args.reason === "OFF_ROUTE" && args.nowMs - args.lastRerouteAtMs < REROUTE_MIN_INTERVAL_MS) {
    return false;
  }
  return true;
}

export type NavLogTag = "NAVIGATION" | "ROUTE" | "OFF_ROUTE" | "REROUTE" | "ARRIVAL";

function navLogEnabled(): boolean {
  try {
    return typeof __DEV__ !== "undefined" ? Boolean(__DEV__) : process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

function formatLogValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NaN";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if ("latitude" in rec && "longitude" in rec) {
      return `${Number(rec.latitude).toFixed(6)},${Number(rec.longitude).toFixed(6)}`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

/** Device-debug logs: `[NAVIGATION] currentLocation=... destination=...` */
export function navLog(tag: NavLogTag, payload: Record<string, unknown>): void {
  if (!navLogEnabled()) return;
  const parts = Object.entries(payload)
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(" ");
  console.log(`[${tag}] ${parts}`);
}

declare const __DEV__: boolean | undefined;
