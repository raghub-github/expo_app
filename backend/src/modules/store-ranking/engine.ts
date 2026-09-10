/**
 * Pure ranking engine. Input: already-eligible candidate features + config. Output: deterministic
 * ranked order with a per-signal breakdown. No DB/network here — feature resolution and the
 * eligibility HARD FILTER happen upstream. Never throws; on any problem it returns the
 * deterministic fallback so food discovery can never break (§40).
 */
import {
  applyCap,
  bayesianRating,
  clamp01,
  distanceScore,
  promiseReliability,
  ratePenalty,
  velocityScore,
} from "./normalize.js";
import type {
  BoostKey,
  PenaltyKey,
  RankedStore,
  RankingConfig,
  ScoreBreakdown,
  SignalKey,
  StoreFeatures,
} from "./types.js";

/** Composite reliability (0..1) — the primary tie-breaker and a customer-facing quality proxy. */
function compositeReliability(f: StoreFeatures): number {
  if (f.reliabilityHint != null && Number.isFinite(f.reliabilityHint)) return clamp01(f.reliabilityHint);
  const eta = promiseReliability(f.promisedEtaMin, f.actualEtaMedianMin);
  const kpt = promiseReliability(f.expectedKptMin, f.actualKptMedianMin);
  const notCancel = clamp01(1 - (Number.isFinite(f.cancellationRate) ? f.cancellationRate : 0));
  return clamp01((eta + kpt + notCancel) / 3);
}

function scoreOne(f: StoreFeatures, cfg: RankingConfig): RankedStore {
  const r = cfg.references;
  const signalNorms: Record<SignalKey, number> = {
    distance: distanceScore(f.roadDistanceKm, r.distanceRefKm),
    rating: bayesianRating(f.avgRating, f.ratingCount, r.ratingPriorMean, r.ratingMinVotes),
    etaReliability: promiseReliability(f.promisedEtaMin, f.actualEtaMedianMin),
    kptReliability: promiseReliability(f.expectedKptMin, f.actualKptMedianMin),
    velocity: velocityScore(f.recentOrders, r.velocityRefOrders, cfg.minSample),
    availability: clamp01(f.availabilityFraction),
  };

  const breakdown: ScoreBreakdown = { signals: {}, boosts: {}, penalties: {} };
  let score = 0;
  (Object.keys(signalNorms) as SignalKey[]).forEach((k) => {
    const pts = signalNorms[k] * (cfg.weights[k] ?? 0);
    breakdown.signals[k] = round2(pts);
    score += pts;
  });

  // Optional organic offer signal (bounded), only when configured.
  if (cfg.offerWeight > 0 && f.offerValue != null) {
    const pts = clamp01(f.offerValue) * cfg.offerWeight;
    breakdown.signals.offer = round2(pts);
    score += pts;
  }

  // Penalties — bounded; a rate is only trusted above minSample observations (recentOrders proxy).
  const penaltyInputs: Record<PenaltyKey, number> = {
    cancellation: f.cancellationRate,
    refund: f.refundRate,
    complaint: f.complaintRate,
    oos: f.oosRate,
  };
  (Object.keys(penaltyInputs) as PenaltyKey[]).forEach((k) => {
    const pen = ratePenalty(
      penaltyInputs[k],
      f.recentOrders,
      r.penaltyRateRef[k],
      cfg.penaltyCaps[k] ?? 0,
      cfg.minSample
    );
    if (pen > 0) breakdown.penalties[k] = round2(-pen);
    score -= pen;
  });

  // Boosts — each capped; kept out of the organic signals so they can nudge, never dominate.
  const boostInputs: Record<BoostKey, number> = {
    subscription: f.subscriptionBoostRaw ?? 0,
    newMerchant: f.isNewMerchantInExplorationWindow ? cfg.boostCaps.newMerchant : 0,
    admin: f.adminBoostRaw ?? 0,
  };
  (Object.keys(boostInputs) as BoostKey[]).forEach((k) => {
    const b = applyCap(boostInputs[k], cfg.boostCaps[k] ?? 0);
    if (b > 0) breakdown.boosts[k] = round2(b);
    score += b;
  });

  return {
    storeId: f.storeId,
    score: round2(Math.max(0, score)),
    reliability: round2(compositeReliability(f)),
    roadDistanceKm: Number.isFinite(f.roadDistanceKm) ? f.roadDistanceKm : Number.POSITIVE_INFINITY,
    etaMin: f.actualEtaMedianMin ?? f.promisedEtaMin ?? null,
    breakdown,
    rankingVersion: cfg.version,
    profile: cfg.profile,
    fallback: false,
  };
}

/** score ▸ reliability ▸ ETA ▸ distance ▸ storeId — fully deterministic (§28). */
function compareRanked(a: RankedStore, b: RankedStore): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.reliability !== a.reliability) return b.reliability - a.reliability;
  const aEta = a.etaMin ?? Number.POSITIVE_INFINITY;
  const bEta = b.etaMin ?? Number.POSITIVE_INFINITY;
  if (aEta !== bEta) return aEta - bEta;
  if (a.roadDistanceKm !== b.roadDistanceKm) return a.roadDistanceKm - b.roadDistanceKm;
  return a.storeId - b.storeId;
}

/** Deterministic fallback: availability ▸ distance ▸ storeId. Used when ranking is disabled or
 *  throws — discovery still returns eligible stores in a sane order (§40). */
export function fallbackRank(candidates: StoreFeatures[], version: string, profile: RankingConfig["profile"]): RankedStore[] {
  return candidates
    .map((f) => ({
      storeId: f.storeId,
      score: 0,
      reliability: round2(compositeReliability(f)),
      roadDistanceKm: Number.isFinite(f.roadDistanceKm) ? f.roadDistanceKm : Number.POSITIVE_INFINITY,
      etaMin: f.actualEtaMedianMin ?? f.promisedEtaMin ?? null,
      breakdown: { signals: {}, boosts: {}, penalties: {} } as ScoreBreakdown,
      rankingVersion: version,
      profile,
      fallback: true,
    }))
    .sort((a, b) => {
      const av = candidates.find((c) => c.storeId === a.storeId)?.availabilityFraction ?? 0;
      const bv = candidates.find((c) => c.storeId === b.storeId)?.availabilityFraction ?? 0;
      if (bv !== av) return bv - av;
      if (a.roadDistanceKm !== b.roadDistanceKm) return a.roadDistanceKm - b.roadDistanceKm;
      return a.storeId - b.storeId;
    });
}

/**
 * Rank an ALREADY-ELIGIBLE candidate list. Ranking is a soft ordering only — callers must have
 * applied serviceability/availability hard filters first.
 */
export function rankStores(candidates: StoreFeatures[], cfg: RankingConfig): RankedStore[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (!cfg || cfg.enabled !== true) {
    return fallbackRank(candidates, cfg?.version ?? "fallback", cfg?.profile ?? "HOME_FOOD");
  }
  try {
    return candidates.map((f) => scoreOne(f, cfg)).sort(compareRanked);
  } catch {
    return fallbackRank(candidates, cfg.version, cfg.profile);
  }
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
