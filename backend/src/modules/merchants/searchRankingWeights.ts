/**
 * Centralized catalog-search ranking weights (no scattered magic numbers).
 * Hierarchy: serviceability → availability → exact/phrase → token → distance → popularity.
 */

export const SEARCH_RANKING_WEIGHTS = {
  /** Exact full-string match on store or item name. */
  exactMatch: 1000,
  /** Query is a prefix of the name (or name starts with query + space). */
  prefixMatch: 600,
  /** All query tokens appear in the name. */
  allTokens: 350,
  /** Per token that appears in the name. */
  perToken: 80,
  /** Substring containment (weaker than token). */
  substring: 40,
  /** Popular / recommended boosts. */
  isPopular: 25,
  isRecommended: 15,
  /**
   * Distance penalty: score -= distanceKm * this.
   * Secondary signal only — never overrides a strong text match.
   */
  distanceKmPenalty: 8,
  /** Cap distance penalty so far-but-exact still ranks above close-but-weak. */
  maxDistancePenalty: 120,
  /**
   * When store-name text score exceeds item-name score by this margin,
   * prefer store-first ordering for brand-like queries.
   */
  entityStoreBiasMargin: 80,
} as const;

export type SearchRankingWeights = typeof SEARCH_RANKING_WEIGHTS;
