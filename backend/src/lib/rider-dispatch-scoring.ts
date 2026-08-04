/**
 * Dispatch Engine — Phase 3: rider scoring.
 *
 * Turns the flat "nearest first" ordering into a configurable weighted score, gated by
 * platform_rider_dispatch_strategy_config.strategy:
 *   - 'nearest'  -> pure distance (unchanged legacy behavior; the safe default)
 *   - 'score' | 'balanced' | 'hybrid' -> weighted score across the signals below
 *
 * All signals are normalized to [0,1] where HIGHER = more of that thing, so weights carry
 * the sign (distance/acceptance/idle/direction positive; cancellation/workload negative in
 * the seeded defaults). The pure math is DB-free and unit-tested; the integration gathers
 * whatever signals are cheaply available and leaves the rest neutral.
 */

import type { DispatchScoreWeights } from "./dispatch-strategy-config.js";

export type RiderScoreSignals = {
  /** 1 at the pickup, →0 at the wave radius edge. */
  distanceScore: number;
  /** Historical accept rate [0,1]. Neutral 0.5 when unknown. */
  acceptanceRate: number;
  /** Historical cancel rate [0,1]. Neutral 0 when unknown. */
  cancellationRate: number;
  /** Idle-ness [0,1] (fairness: spread work to idle riders). Neutral 0 when unknown. */
  idleScore: number;
  /** Current workload [0,1] (more active orders = higher = penalized). Neutral 0 when unknown. */
  workloadScore: number;
  /** Heading alignment rider→pickup [0,1]. Neutral 0 when unknown. */
  directionAlignment: number;
};

export const NEUTRAL_SCORE_SIGNALS: Omit<RiderScoreSignals, "distanceScore"> = {
  acceptanceRate: 0.5,
  cancellationRate: 0,
  idleScore: 0,
  workloadScore: 0,
  directionAlignment: 0,
};

export function clamp01(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Normalize a pickup distance to a [0,1] closeness score against the wave radius. */
export function distanceToScore(distanceMeters: number, radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return 0;
  const d = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters : 0;
  return clamp01(1 - d / radiusMeters);
}

/** Weighted rider score. Higher is better. Pure — no DB, no side effects. */
export function computeRiderDispatchScore(
  signals: RiderScoreSignals,
  weights: DispatchScoreWeights
): number {
  const s =
    weights.distance * clamp01(signals.distanceScore) +
    weights.acceptanceRate * clamp01(signals.acceptanceRate) +
    weights.cancellationRate * clamp01(signals.cancellationRate) +
    weights.idleBonus * clamp01(signals.idleScore) +
    weights.workloadPenalty * clamp01(signals.workloadScore) +
    weights.directionAlignment * clamp01(signals.directionAlignment);
  return Math.round(s * 1e6) / 1e6;
}

export type ScorableRider = {
  riderId: number;
  distanceMeters: number;
  /** Optional enrichment; missing fields fall back to NEUTRAL_SCORE_SIGNALS. */
  acceptanceRate?: number;
  cancellationRate?: number;
  idleScore?: number;
  workloadScore?: number;
  directionAlignment?: number;
};

export type RankedRider<T> = T & { dispatchScore: number };

/**
 * Rank riders by the weighted score (descending), tie-broken by distance (ascending).
 * Returns a new array; does not mutate the input. Radius is the wave's effective pickup
 * radius, used to normalize distance.
 */
export function rankRidersByScore<T extends ScorableRider>(
  riders: readonly T[],
  weights: DispatchScoreWeights,
  radiusMeters: number
): RankedRider<T>[] {
  const scored = riders.map((r) => {
    const signals: RiderScoreSignals = {
      distanceScore: distanceToScore(r.distanceMeters, radiusMeters),
      acceptanceRate: r.acceptanceRate ?? NEUTRAL_SCORE_SIGNALS.acceptanceRate,
      cancellationRate: r.cancellationRate ?? NEUTRAL_SCORE_SIGNALS.cancellationRate,
      idleScore: r.idleScore ?? NEUTRAL_SCORE_SIGNALS.idleScore,
      workloadScore: r.workloadScore ?? NEUTRAL_SCORE_SIGNALS.workloadScore,
      directionAlignment: r.directionAlignment ?? NEUTRAL_SCORE_SIGNALS.directionAlignment,
    };
    return { ...r, dispatchScore: computeRiderDispatchScore(signals, weights) };
  });

  return scored.sort((a, b) => {
    if (b.dispatchScore !== a.dispatchScore) return b.dispatchScore - a.dispatchScore;
    return a.distanceMeters - b.distanceMeters;
  });
}
