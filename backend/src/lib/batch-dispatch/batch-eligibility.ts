/**
 * Batch dispatch — HARD eligibility gate (PURE). This is the operational-state + service layer of
 * the batching decision; it sits AFTER the existing capacity/cross-service/person-exclusive engine
 * (rider-assignment-control.ts) and BEFORE the route-feasibility engine. It answers: is this rider,
 * in their current operational state, allowed to be offered one more `candidateService` order as a
 * BATCH — before we spend any route math on it?
 *
 * Everything here is a HARD constraint (§22): if any check fails the rider is not a batch candidate.
 * Route quality/score is decided separately (batch-route.ts). All reasons are machine-readable (§65).
 */

import {
  operationalState,
  riderStatePermitsBatching,
  type OrderStatus,
} from "./operational-state.js";

export type BatchService = "food" | "parcel" | "person_ride";

export type BatchRejectionReason =
  | "BATCHING_DISABLED"
  | "PERSON_RIDE_NOT_BATCHABLE"
  | "CAPACITY_REACHED"
  | "RIDER_IN_PICKUP_TO_DROP_STATE"
  | "STALE_LOCATION"
  | "SERVICE_MISMATCH_CROSS_SERVICE_OFF";

export type BatchEligibilityInput = {
  candidateService: BatchService;
  /** Statuses of the rider's current active orders (this service). */
  activeOrderStatuses: OrderStatus[];
  /** Service types of the rider's current active orders (for cross-service gating). */
  activeOrderServices: BatchService[];
  /** Configured max active orders for the candidate service (from service_assignment_limits). */
  maxActiveForService: number;
  /** Whether batching is enabled for the candidate service (dispatch_batch_config). */
  batchingEnabled: boolean;
  /** Whether cross-service stacking is allowed (service_assignment_limits global). */
  allowCrossService: boolean;
  /** Rider-location freshness classification (from classifyRiderLocationFreshness). */
  locationFreshness: "FRESH" | "STALE" | "UNKNOWN";
};

export type BatchEligibilityResult = {
  eligible: boolean;
  reason: BatchRejectionReason | null;
  activeCount: number;
};

/**
 * Decide batch eligibility. NOTE: this governs ADDITIONAL orders only (rider already has ≥1 active
 * order). First-order dispatch is unchanged and handled by the existing engine.
 */
export function evaluateBatchEligibility(input: BatchEligibilityInput): BatchEligibilityResult {
  const activeSameService = input.activeOrderStatuses.filter(
    (s) => operationalState(s) !== "TERMINAL"
  );
  const activeCount = activeSameService.length;
  const fail = (reason: BatchRejectionReason): BatchEligibilityResult => ({
    eligible: false,
    reason,
    activeCount,
  });

  // Person Ride is never batched (§5), regardless of config.
  if (input.candidateService === "person_ride") return fail("PERSON_RIDE_NOT_BATCHABLE");
  // If any active order is a person ride, no additional service may batch (person-exclusive owns it;
  // enforced authoritatively upstream too, but we hard-stop here as well).
  if (input.activeOrderServices.includes("person_ride")) return fail("PERSON_RIDE_NOT_BATCHABLE");

  if (!input.batchingEnabled) return fail("BATCHING_DISABLED");

  // Cross-service off → the candidate must match the (single) active service.
  if (!input.allowCrossService) {
    const others = input.activeOrderServices.filter((s) => s !== input.candidateService);
    if (others.length > 0) return fail("SERVICE_MISMATCH_CROSS_SERVICE_OFF");
  }

  // Capacity (§14/§41/§42) — count only active (non-terminal) orders.
  if (activeCount >= Math.max(0, Math.trunc(input.maxActiveForService))) {
    return fail("CAPACITY_REACHED");
  }

  // Location must be trustworthy for a dynamic batch decision (§7–10). Stale/unknown → no risky batch.
  if (input.locationFreshness !== "FRESH") return fail("STALE_LOCATION");

  // Operational-state gate (§37–39): every active order must still be pre-pickup.
  if (!riderStatePermitsBatching(input.activeOrderStatuses)) {
    return fail("RIDER_IN_PICKUP_TO_DROP_STATE");
  }

  return { eligible: true, reason: null, activeCount };
}
