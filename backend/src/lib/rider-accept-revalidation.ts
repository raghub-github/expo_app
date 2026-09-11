/**
 * GAP 2 — final location revalidation at ACCEPT time.
 *
 * A dispatch offer is validated when it is sent (fresh GPS + inside the wave pickup radius). But
 * between the offer and the rider tapping "Accept", the rider can go stale (stopped pinging) or
 * physically move out of the pickup radius. The atomic claim is race-safe but does NOT re-check
 * location, so a stale/out-of-range rider could still win the order. This is the pure decision used
 * to gate that — mode handling (off/shadow/enforce) lives at the call site.
 */
import { getEnv } from "../config/env.js";

export type RiderAcceptRevalidateMode = "off" | "shadow" | "enforce";

export function riderAcceptRevalidateMode(): RiderAcceptRevalidateMode {
  return getEnv().RIDER_ACCEPT_REVALIDATE_MODE;
}

export type RiderAcceptRevalidationInput = {
  /** Whether ANY location (fresh or last-known) is available for the rider. */
  hasGps: boolean;
  /** Age of that location in seconds (Infinity when unknown). */
  gpsAgeSeconds: number;
  /** Haversine distance from the rider's location to the order pickup, meters. */
  distanceMeters: number;
  /** Current-wave configured pickup radius, meters. */
  radiusMeters: number;
  /** Max acceptable GPS age — the STALE window, not the tighter fresh window. */
  staleMaxSeconds: number;
};

export type RiderAcceptRevalidationDecision = {
  allow: boolean;
  reason: "ok" | "location_missing" | "location_stale" | "outside_pickup_radius";
};

/**
 * PURE: decide whether a rider may still claim the order at accept time.
 * Order of checks: presence → freshness → radius. Never throws.
 */
export function evaluateRiderAcceptRevalidation(
  input: RiderAcceptRevalidationInput
): RiderAcceptRevalidationDecision {
  if (!input.hasGps || !Number.isFinite(input.gpsAgeSeconds)) {
    return { allow: false, reason: "location_missing" };
  }
  if (input.gpsAgeSeconds > input.staleMaxSeconds) {
    return { allow: false, reason: "location_stale" };
  }
  // Radius must be a positive configured value; a non-positive/invalid radius means "unknown" and
  // must not silently reject (fail-open on config gaps — dispatch already gated this at offer time).
  if (Number.isFinite(input.radiusMeters) && input.radiusMeters > 0) {
    if (!Number.isFinite(input.distanceMeters) || input.distanceMeters > input.radiusMeters) {
      return { allow: false, reason: "outside_pickup_radius" };
    }
  }
  return { allow: true, reason: "ok" };
}

/** User-facing 409 message per reason. */
export function riderAcceptRevalidationMessage(
  reason: RiderAcceptRevalidationDecision["reason"]
): string {
  switch (reason) {
    case "location_stale":
      return "Your location is out of date. Turn location on and try again.";
    case "outside_pickup_radius":
      return "You have moved out of the pickup area for this order.";
    case "location_missing":
      return "We couldn't confirm your location. Turn location on and try again.";
    default:
      return "This order is no longer available to you.";
  }
}
