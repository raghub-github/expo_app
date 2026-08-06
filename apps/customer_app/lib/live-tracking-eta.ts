/**
 * Live tracking ETA helpers — smoothing, stuck/GPS/arrival detection, stage awareness.
 * Pure functions so the hook stays thin and behavior is easy to reason about.
 */

import type { FoodDeliveryMapPhase } from "@/lib/food-delivery-map-phase";
import { haversineMeters } from "@/lib/map-route-utils";
import {
  isCustomerOrderOnTheWayStatus,
  isMerchantPreparingStatus,
  isRiderAtCustomerStatus,
  isRiderAtStoreStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

/** Ignore movement ETA jitter smaller than this (seconds). */
export const ETA_NOISE_SECONDS = 45;
/** Max minutes the display can drop per tick (~15s) unless a big route drop confirms it. */
export const ETA_MAX_DROP_PER_TICK = 1;
/** Rider considered stuck if moved less than this for STUCK_MS. */
export const STUCK_MOVE_THRESHOLD_M = 35;
export const STUCK_MS = 150_000; // 2.5 min
/** GPS sample older than this → location temporarily unavailable. */
export const GPS_STALE_MS = 90_000;
/** Within this distance of drop → "Arriving now". */
export const ARRIVING_DISTANCE_M = 450;
/** Display floor while actively en-route (before arrival mode). */
export const MIN_ACTIVE_ETA = 3;
export const ARRIVING_ETA_MINUTES = 2;

export type LiveEtaPhase =
  | "preparing"
  | "rider_to_store"
  | "waiting_at_store"
  | "on_the_way"
  | "arriving"
  | "arrived";

export type EtaConfidence = "high" | "medium" | "low";

export type LiveTrackingEtaResult = {
  minutes: number | null;
  /** Delay without a bumped promise — "Slight delay". */
  frozenForDelay: boolean;
  /** Within ~450m / ≤2 min of drop. */
  arrivingSoon: boolean;
  /** Rider GPS not moving for ~2.5 min while expected to be moving. */
  stuckRider: boolean;
  /** Rider location sample is stale / missing while we need it. */
  gpsUnavailable: boolean;
  confidence: EtaConfidence;
  phase: LiveEtaPhase;
  /** True when countdown should not tick down (waiting / stuck / GPS loss). */
  countdownPaused: boolean;
};

export type RiderMotionSample = {
  latitude: number;
  longitude: number;
  updatedAtMs: number;
};

export type RiderMotionState = {
  stuck: boolean;
  gpsStale: boolean;
  lastMovedAtMs: number | null;
};

export function resolveLiveEtaPhase(args: {
  status: string;
  mapPhase: FoodDeliveryMapPhase;
  hasRider: boolean;
  riderArrived: boolean;
  arrivingSoon: boolean;
  waitingAtStore: boolean;
  /** Server stage when available — wins over client inference. */
  serverStage?: string | null;
}): LiveEtaPhase {
  if (args.serverStage === "DELIVERED") return "arrived";
  if (args.serverStage === "ARRIVING") return "arriving";
  if (args.serverStage === "CUSTOMER_DELIVERY") return "on_the_way";
  // Admin Dispatched / pickup complete — trust order status over stale RIDER_TO_MERCHANT.
  if (args.mapPhase === "rider_to_drop" || isCustomerOrderOnTheWayStatus(args.status)) {
    return "on_the_way";
  }
  if (args.serverStage === "AT_STORE") return "waiting_at_store";
  if (args.serverStage === "RIDER_TO_MERCHANT") return "rider_to_store";
  if (args.serverStage === "MERCHANT_PREP" || args.serverStage === "MERCHANT_ACCEPTED") {
    return "preparing";
  }
  if (args.serverStage === "READY_AWAITING_RIDER") return "preparing";

  if (args.riderArrived || isRiderAtCustomerStatus(args.status)) return "arrived";
  if (args.arrivingSoon) return "arriving";
  if (args.waitingAtStore || isRiderAtStoreStatus(args.status)) return "waiting_at_store";
  if (args.hasRider) return "rider_to_store";
  if (isMerchantPreparingStatus(args.status)) return "preparing";
  const s = normalizeCustomerOrderStatus(args.status);
  if (s === "ORDER_PLACED" || s === "PLACED" || s === "CREATED" || s === "SEARCHING_RIDER") {
    return "preparing";
  }
  return "preparing";
}

/**
 * Update motion memory. Call when a new rider fix arrives.
 * Returns whether the rider is stuck / GPS is stale at `nowMs`.
 */
export function updateRiderMotionState(
  prev: {
    orderId: string;
    anchor: RiderMotionSample | null;
    lastMovedAtMs: number | null;
  },
  args: {
    orderId: string;
    sample: RiderMotionSample | null;
    nowMs: number;
    /** Only treat as "stuck" when the rider is expected to be moving. */
    expectMovement: boolean;
  }
): { next: typeof prev; state: RiderMotionState } {
  if (prev.orderId !== args.orderId) {
    prev = { orderId: args.orderId, anchor: null, lastMovedAtMs: null };
  }

  const sample = args.sample;
  if (!sample) {
    return {
      next: prev,
      state: {
        stuck: false,
        gpsStale: args.expectMovement,
        lastMovedAtMs: prev.lastMovedAtMs,
      },
    };
  }

  const gpsStale = args.nowMs - sample.updatedAtMs > GPS_STALE_MS;

  let anchor = prev.anchor;
  let lastMovedAtMs = prev.lastMovedAtMs;

  if (!anchor) {
    anchor = sample;
    lastMovedAtMs = sample.updatedAtMs;
  } else {
    const movedM = haversineMeters(
      anchor.latitude,
      anchor.longitude,
      sample.latitude,
      sample.longitude
    );
    if (movedM >= STUCK_MOVE_THRESHOLD_M) {
      anchor = sample;
      lastMovedAtMs = sample.updatedAtMs;
    }
  }

  const stuck =
    args.expectMovement &&
    !gpsStale &&
    lastMovedAtMs != null &&
    args.nowMs - lastMovedAtMs >= STUCK_MS;

  return {
    next: { orderId: args.orderId, anchor, lastMovedAtMs },
    state: { stuck, gpsStale, lastMovedAtMs },
  };
}

export function resolveEtaConfidence(args: {
  gpsStale: boolean;
  stuck: boolean;
  accuracyMeters?: number | null;
  merchantDelayed?: boolean;
  hasMovementEta: boolean;
}): EtaConfidence {
  if (args.gpsStale || args.stuck) return "low";
  if (args.merchantDelayed) return "medium";
  const acc = args.accuracyMeters;
  if (acc != null && Number.isFinite(acc) && acc > 80) return "medium";
  if (args.hasMovementEta) return "high";
  return "medium";
}

/**
 * Smooth a candidate ETA against the previously shown value.
 * - Ignores ±noise jitter
 * - Caps how fast minutes can fall per tick
 * - Never invents an increase unless `allowBump`
 * - Holds value when `pauseCountdown`
 */
export function smoothEtaMinutes(args: {
  prev: number | null;
  candidate: number | null;
  allowBump: boolean;
  pauseCountdown: boolean;
  /** Large remaining-distance drop (meters) can justify a bigger minute drop. */
  remainingDistanceDropM?: number | null;
}): { value: number | null; heldForDelay: boolean } {
  const { prev, candidate, allowBump, pauseCountdown } = args;
  if (candidate == null) return { value: prev, heldForDelay: false };
  if (prev == null) return { value: candidate, heldForDelay: false };

  if (pauseCountdown) {
    if (candidate > prev && allowBump) return { value: candidate, heldForDelay: false };
    return { value: prev, heldForDelay: candidate > prev ? !allowBump : false };
  }

  if (candidate > prev) {
    if (allowBump) return { value: candidate, heldForDelay: false };
    return { value: prev, heldForDelay: true };
  }

  if (candidate === prev) return { value: prev, heldForDelay: false };

  // candidate < prev — apply noise gate + rate limit
  const dropMin = prev - candidate;
  const dropSec = dropMin * 60;
  if (dropSec < ETA_NOISE_SECONDS) {
    return { value: prev, heldForDelay: false };
  }

  const bigRouteDrop =
    args.remainingDistanceDropM != null && args.remainingDistanceDropM >= 400;
  const maxDrop = bigRouteDrop ? Math.min(dropMin, 3) : ETA_MAX_DROP_PER_TICK;
  const next = Math.max(candidate, prev - maxDrop);
  return { value: next, heldForDelay: false };
}

export function blendPromiseAndMovementEta(
  promiseEta: number | null,
  movementEta: number | null
): number | null {
  if (
    movementEta != null &&
    Number.isFinite(movementEta) &&
    movementEta > 0
  ) {
    const move = Math.max(MIN_ACTIVE_ETA, Math.round(movementEta));
    if (promiseEta == null) return move;
    return Math.min(promiseEta, move);
  }
  return promiseEta;
}

export function isArrivingSoon(args: {
  remainingDistanceM: number | null | undefined;
  etaMinutes: number | null;
  mapPhase: FoodDeliveryMapPhase;
  riderArrived: boolean;
}): boolean {
  if (args.riderArrived) return false;
  if (args.mapPhase !== "rider_to_drop") return false;
  if (args.remainingDistanceM != null && args.remainingDistanceM <= ARRIVING_DISTANCE_M) {
    return true;
  }
  if (args.etaMinutes != null && args.etaMinutes > 0 && args.etaMinutes <= ARRIVING_ETA_MINUTES) {
    return true;
  }
  return false;
}
