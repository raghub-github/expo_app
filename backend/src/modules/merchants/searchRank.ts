/**
 * Deterministic app-layer relevance re-score for catalog search candidates.
 * Preserves RPC input order when scores tie (stable sort).
 */

import { normalizeSearchQuery } from "./searchNormalize.js";
import { SEARCH_RANKING_WEIGHTS as W } from "./searchRankingWeights.js";

export type RankableStore = {
  id: number;
  store_name: string;
  store_display_name: string | null;
  cuisine_types?: string[] | null;
  /** True when this kitchen was included because it sells a matching item. */
  matchedViaItem?: boolean;
  distance_km?: number | null;
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
  /** Preserve RPC order. */
  _rpcIndex?: number;
};

export type RankableDish = {
  store_id: number;
  item_name: string;
  is_popular?: boolean | null;
  is_recommended?: boolean | null;
  distance_km?: number | null;
  _rpcIndex?: number;
};

function textMatchScore(name: string, queryNorm: string, tokens: string[]): number {
  const n = normalizeSearchQuery(name).normalized;
  if (!n || !queryNorm) return 0;
  if (n === queryNorm) return W.exactMatch;
  if (n.startsWith(queryNorm + " ") || n.startsWith(queryNorm)) return W.prefixMatch;

  let score = 0;
  if (tokens.length > 0) {
    const hitCount = tokens.filter((t) => n.includes(t)).length;
    if (hitCount === tokens.length) score += W.allTokens;
    score += hitCount * W.perToken;
  }
  if (n.includes(queryNorm)) score += W.substring;
  return score;
}

function distancePenalty(distanceKm: number | null | undefined): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 0;
  return Math.min(W.maxDistancePenalty, Math.max(0, distanceKm) * W.distanceKmPenalty);
}

function availabilityBoost(row: {
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
}): number {
  // Soft preference only — hard filters happen in serviceability.
  let s = 0;
  if (row.is_accepting_orders === true) s += 30;
  if (row.is_available === true) s += 20;
  if (row.is_accepting_orders === false) s -= 40;
  return s;
}

export function scoreStoreName(store: RankableStore, query: string): number {
  const { normalized, tokens } = normalizeSearchQuery(query);
  const label = store.store_display_name?.trim() || store.store_name;
  const cuisineBlob = (store.cuisine_types ?? []).join(" ");
  let s =
    textMatchScore(label, normalized, tokens) +
    Math.floor(textMatchScore(cuisineBlob, normalized, tokens) * 0.7) +
    availabilityBoost(store) -
    distancePenalty(store.distance_km);
  if (store.matchedViaItem) s += W.allTokens;
  return s;
}

export function scoreDishName(dish: RankableDish, query: string): number {
  const { normalized, tokens } = normalizeSearchQuery(query);
  let s = textMatchScore(dish.item_name, normalized, tokens);
  if (dish.is_popular) s += W.isPopular;
  if (dish.is_recommended) s += W.isRecommended;
  s -= distancePenalty(dish.distance_km);
  return s;
}

/**
 * Entity-aware: if best store-name score clearly beats best dish score,
 * keep stores ordered first in the response (caller decides presentation).
 * Returns reordered arrays; stable on ties via _rpcIndex.
 */
export function rankSearchResults<S extends RankableStore, D extends RankableDish>(
  query: string,
  stores: S[],
  dishes: D[]
): { stores: S[]; dishes: D[]; preferStores: boolean } {
  const storesScored = stores.map((s, i) => ({
    s,
    score: scoreStoreName({ ...s, _rpcIndex: s._rpcIndex ?? i }, query),
    idx: s._rpcIndex ?? i,
  }));
  const dishesScored = dishes.map((d, i) => ({
    d,
    score: scoreDishName({ ...d, _rpcIndex: d._rpcIndex ?? i }, query),
    idx: d._rpcIndex ?? i,
  }));

  storesScored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  dishesScored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const bestStore = storesScored[0]?.score ?? 0;
  const bestDish = dishesScored[0]?.score ?? 0;
  const preferStores = bestStore >= bestDish + W.entityStoreBiasMargin;

  return {
    stores: storesScored.map((x) => x.s),
    dishes: dishesScored.map((x) => x.d),
    preferStores,
  };
}
