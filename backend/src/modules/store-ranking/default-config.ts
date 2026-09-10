/**
 * Default HOME_FOOD ranking config (v1). These live in code as the safe seed; Super Admin will be
 * able to override them per profile/geo (stored in `ranking_config`, later phase). Weights are
 * "max points" for each organic signal — the theoretical organic max here is the sum of weights.
 *
 * Conversion (CTR/CVR) is deliberately absent — no impression/click events are instrumented yet.
 */
import type { RankingConfig } from "./types.js";

export const DEFAULT_HOME_FOOD_CONFIG: RankingConfig = {
  version: "home_food_v1",
  profile: "HOME_FOOD",
  enabled: false, // ship dark — flip per-geo from Super Admin
  weights: {
    distance: 22,
    rating: 18,
    etaReliability: 14,
    kptReliability: 10,
    velocity: 12,
    availability: 12,
  },
  offerWeight: 6,
  penaltyCaps: {
    cancellation: 14,
    refund: 8,
    complaint: 8,
    oos: 8,
  },
  boostCaps: {
    subscription: 6, // capped so paid visibility can nudge, never dominate
    newMerchant: 6, // time-boxed exploration
    admin: 10,
  },
  references: {
    distanceRefKm: 8,
    ratingPriorMean: 4.0,
    ratingMinVotes: 20,
    velocityRefOrders: 200,
    penaltyRateRef: {
      cancellation: 0.2,
      refund: 0.15,
      complaint: 0.15,
      oos: 0.5,
    },
  },
  minSample: 20,
};

export function defaultConfigForProfile(profile: RankingConfig["profile"]): RankingConfig {
  // V1 ships HOME_FOOD; other profiles reuse it until their own weights are configured.
  return { ...DEFAULT_HOME_FOOD_CONFIG, profile };
}
