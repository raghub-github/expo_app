/**
 * Batch dispatch — the single decision composer (PURE). Combines the hard eligibility gate
 * (batch-eligibility) with the route-feasibility engine (batch-route) into one call:
 * `evaluateBatchCandidate(...)` → is this rider a valid, route-feasible BATCH target for this order,
 * and at what score? This is exactly what the live dispatcher will invoke per candidate once wired
 * behind the flag; keeping it here (pure + tested) means the wiring is thin and the logic is proven.
 *
 * `pickBestBatchCandidate` ranks the offered candidates (lowest route cost wins) — but batching is
 * never FORCED (§29/§52): the caller compares this best batch against assigning the order to an idle
 * rider and picks the better overall outcome.
 */
import {
  evaluateBatchEligibility,
  type BatchEligibilityInput,
  type BatchRejectionReason,
} from "./batch-eligibility.js";
import {
  evaluateBatchInsertion,
  type BatchRouteInput,
  type BatchRouteReason,
  type RouteStop,
  type LatLng,
} from "./batch-route.js";

export type BatchCandidateInput = {
  riderId: number;
  eligibility: Omit<BatchEligibilityInput, never>;
  route: Omit<BatchRouteInput, never>;
};

export type BatchCandidateDecision = {
  riderId: number;
  eligible: boolean;
  offered: boolean; // eligible AND route-feasible
  reason: BatchRejectionReason | BatchRouteReason | null;
  score: number; // route cost, lower is better; +Infinity when not offered
  addedTravelMin: number;
  pickupDetourKm: number;
  sequence: Array<{ orderId: number; kind: "pickup" | "drop" }>;
};

export function evaluateBatchCandidate(input: BatchCandidateInput): BatchCandidateDecision {
  const notOffered = (
    eligible: boolean,
    reason: BatchRejectionReason | BatchRouteReason | null
  ): BatchCandidateDecision => ({
    riderId: input.riderId,
    eligible,
    offered: false,
    reason,
    score: Number.POSITIVE_INFINITY,
    addedTravelMin: Number.POSITIVE_INFINITY,
    pickupDetourKm: Number.POSITIVE_INFINITY,
    sequence: [],
  });

  const elig = evaluateBatchEligibility(input.eligibility);
  if (!elig.eligible) return notOffered(false, elig.reason);

  const route = evaluateBatchInsertion(input.route);
  if (!route.feasible) return notOffered(true, route.reason);

  return {
    riderId: input.riderId,
    eligible: true,
    offered: true,
    reason: null,
    score: route.score,
    addedTravelMin: route.addedTravelMin,
    pickupDetourKm: route.pickupDetourKm,
    sequence: route.sequence,
  };
}

/** Best (lowest-cost) offered batch candidate, or null if none is feasible. */
export function pickBestBatchCandidate(
  decisions: BatchCandidateDecision[]
): BatchCandidateDecision | null {
  let best: BatchCandidateDecision | null = null;
  for (const d of decisions) {
    if (!d.offered) continue;
    if (!best || d.score < best.score || (d.score === best.score && d.riderId < best.riderId)) {
      best = d;
    }
  }
  return best;
}

export type { RouteStop, LatLng };
