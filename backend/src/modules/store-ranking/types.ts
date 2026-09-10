/**
 * GatiMitra food store ranking — pure engine types.
 *
 * This module is DEPENDENCY-FREE (no DB, no network, no Fastify). It takes already-resolved,
 * already-eligible candidate features + a config and returns a deterministic ranked order with a
 * per-signal explanation. Eligibility/serviceability is a HARD FILTER applied BEFORE this engine
 * (see docs/store-discovery.md serviceability); ranking never resurrects an ineligible store.
 *
 * Design goals (from the ranking spec): every signal is normalized to [0,1], every boost/penalty
 * is bounded, the whole thing is config-driven + versioned, and there is a deterministic fallback.
 */

/** Ranking profiles — one engine, different weight sets. */
export type RankingProfile =
  | "HOME_FOOD"
  | "FOOD_CATEGORY"
  | "FOOD_SEARCH"
  | "FOOD_CUISINE"
  | "REORDER";

/** Organic signals scored in V1. Conversion (CTR/CVR) is intentionally omitted until store
 *  impression/click events are instrumented (product decision: defer). */
export type SignalKey =
  | "distance"
  | "rating"
  | "etaReliability"
  | "kptReliability"
  | "velocity"
  | "availability";

/** Bounded penalties (each subtracts at most its cap from the score). */
export type PenaltyKey = "cancellation" | "refund" | "complaint" | "oos";

/** Bounded boosts (each adds at most its cap). Kept separate from organic signals so paid/
 *  exploratory visibility never corrupts the organic score. */
export type BoostKey = "subscription" | "newMerchant" | "admin";

/** Raw, per-store inputs. Rates are 0..1. Counts are already windowed/decayed upstream. */
export type StoreFeatures = {
  storeId: number;
  /** Road distance to the customer (km) — from the Matrix step. */
  roadDistanceKm: number;
  /** Bayesian rating inputs (customer-visible rating is untouched elsewhere). */
  avgRating: number; // 0..5
  ratingCount: number;
  /** ETA: promised vs actual median (minutes). null when unknown → neutral. */
  promisedEtaMin: number | null;
  actualEtaMedianMin: number | null;
  /** KPT: expected (configured) vs actual median prep (minutes). null → neutral. */
  expectedKptMin: number | null;
  actualKptMedianMin: number | null;
  /** Recent successful order count (already windowed + decayed upstream). */
  recentOrders: number;
  /** Menu availability 0..1 (1 = fully available; = 1 - OOS fraction). */
  availabilityFraction: number;
  /** Windowed rates 0..1 (already Bayesian-smoothed / min-sample handled upstream where possible). */
  cancellationRate: number;
  refundRate: number;
  complaintRate: number;
  oosRate: number;
  /** Bounded organic offer value 0..1 (effective, capped savings) — optional signal add-on. */
  offerValue?: number;
  /** Boost inputs (already validated: active subscription plan boost, exploration eligibility…). */
  subscriptionBoostRaw?: number;
  isNewMerchantInExplorationWindow?: boolean;
  adminBoostRaw?: number;
  /** Deterministic tie-breakers already available on the candidate. */
  reliabilityHint?: number; // 0..1, optional pre-computed
};

/** Normalization + smoothing references (all overridable via config). */
export type RankingReferences = {
  /** Distance at which the distance score reaches 0 (km). */
  distanceRefKm: number;
  /** Bayesian rating prior: global mean C and min-votes m. */
  ratingPriorMean: number; // C, 0..5
  ratingMinVotes: number; // m
  /** Recent-order count that maps to a full velocity score. */
  velocityRefOrders: number;
  /** Rate at which a penalty reaches its full magnitude (e.g. 0.2 = 20%). */
  penaltyRateRef: Record<PenaltyKey, number>;
};

export type RankingConfig = {
  version: string;
  profile: RankingProfile;
  enabled: boolean;
  /** Organic signal weights (need not sum to 1; the score is not renormalized so weights are
   *  directly interpretable as max points). */
  weights: Record<SignalKey, number>;
  /** Optional organic offer weight (0 disables). */
  offerWeight: number;
  /** Max points each penalty can subtract. */
  penaltyCaps: Record<PenaltyKey, number>;
  /** Max points each boost can add. */
  boostCaps: Record<BoostKey, number>;
  references: RankingReferences;
  /** Minimum sample below which a rate/velocity signal falls back to neutral. */
  minSample: number;
};

/** Per-signal contribution for the internal (Super-Admin only) explanation. */
export type ScoreBreakdown = {
  signals: Partial<Record<SignalKey | "offer", number>>;
  boosts: Partial<Record<BoostKey, number>>;
  penalties: Partial<Record<PenaltyKey, number>>;
};

export type RankedStore = {
  storeId: number;
  score: number;
  /** 0..1 composite reliability used as the primary tie-breaker. */
  reliability: number;
  roadDistanceKm: number;
  etaMin: number | null;
  breakdown: ScoreBreakdown;
  rankingVersion: string;
  profile: RankingProfile;
  /** True when produced by the deterministic fallback path (ranking disabled/failed). */
  fallback: boolean;
};
