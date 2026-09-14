/**
 * Integrate the pure ranking engine into the home food list (`/v1/merchants`, FOOD). The eligible
 * candidate POOL is ranked, THEN the caller paginates (§29). Config + enable now come from the DB
 * (store_ranking_config, Super-Admin tunable, kill-switch respected) via loadStoredRankingConfig;
 * with the code default as a fail-safe. Fail-open: on disabled/failure the caller's existing
 * distance order is preserved unchanged, so discovery never breaks.
 *
 * Eligibility/serviceability + open/close gating stay UPSTREAM in the list handler — this only
 * reorders already-eligible candidates. Live availability isn't cheaply available per-pool-store
 * here, so V1 treats eligible candidates as available (availabilityFraction=1, oosRate=0); OOS/live
 * enrichment is a later phase. Active-subscription boosts are applied here (bounded by the engine's
 * boostCaps.subscription, never bypassing eligibility). No pricing touched.
 */
import { rankStores } from "./engine.js";
import { loadStoredRankingConfig } from "./config-store.js";
import { loadRankingMetricsForStores, metricsToHistoricalFeatures } from "./metrics-read.js";
import { loadActiveSubscriptionBoosts } from "./subscription-boost.js";
import type { RankingConfig, StoreFeatures } from "./types.js";
import type { RankingMetricsRow } from "./metrics-read.js";

/** Minimal candidate shape the engine needs from a list row. */
export type HomeFoodCandidate = { id: number | string; distance_km?: number | null };

function candidateId(c: HomeFoodCandidate): number {
  const n = Number(c.id);
  return Number.isFinite(n) ? n : 0;
}

/**
 * PURE: order an eligible candidate pool by ranking, given pre-loaded metrics + subscription boosts.
 * Returns the SAME row objects reordered (never drops rows — ranking is soft ordering). Rows the
 * engine can't place (unknown id) keep their original relative position at the end.
 */
export function orderPoolByRanking<T extends HomeFoodCandidate>(
  rows: T[],
  metricsById: Map<number, RankingMetricsRow>,
  cfg: RankingConfig,
  subscriptionBoosts: Map<number, number> = new Map()
): T[] {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;
  if (!cfg.enabled) return rows;

  const rowById = new Map<number, T>();
  const features: StoreFeatures[] = [];
  for (const row of rows) {
    const id = candidateId(row);
    if (id <= 0 || rowById.has(id)) continue; // skip dupes / bad ids (kept via leftover pass below)
    rowById.set(id, row);
    const hist = metricsToHistoricalFeatures(metricsById.get(id));
    features.push({
      storeId: id,
      roadDistanceKm: Number(row.distance_km) > 0 ? Number(row.distance_km) : 0,
      // Live availability isn't resolved per-pool here — eligible candidates already passed
      // serviceability upstream, so treat as available; OOS/live enrichment is a later phase.
      availabilityFraction: 1,
      oosRate: 0,
      subscriptionBoostRaw: subscriptionBoosts.get(id) ?? 0,
      ...hist,
    });
  }

  const ranked = rankStores(features, cfg);
  const orderedIds = ranked.map((r) => r.storeId);
  const seen = new Set<number>();
  const out: T[] = [];
  for (const id of orderedIds) {
    const row = rowById.get(id);
    if (row && !seen.has(id)) {
      out.push(row);
      seen.add(id);
    }
  }
  // Preserve any rows the engine didn't place (bad/dup id) in original order at the end.
  for (const row of rows) {
    const id = candidateId(row);
    if (!seen.has(id)) {
      out.push(row);
      seen.add(id);
    }
  }
  return out;
}

/**
 * Rank an eligible home-food candidate pool. Loads DB config + metrics + subscription boosts, then
 * orders. Fail-open: on any error (or disabled) returns the pool unchanged so discovery never breaks.
 */
export async function rankHomeFoodPool<T extends HomeFoodCandidate>(
  rows: T[]
): Promise<{ rows: T[]; ranked: boolean; version: string; candidateCount: number }> {
  const candidateCount = rows.length;
  if (rows.length <= 1) {
    return { rows, ranked: false, version: "home_food_v1", candidateCount };
  }
  try {
    const stored = await loadStoredRankingConfig("HOME_FOOD");
    const cfg = stored.config;
    if (!cfg.enabled) {
      return { rows, ranked: false, version: cfg.version, candidateCount };
    }
    const ids = rows.map(candidateId).filter((n) => n > 0);
    const [metrics, subBoosts] = await Promise.all([
      loadRankingMetricsForStores(ids),
      loadActiveSubscriptionBoosts(ids, stored.subscriptionPlanBoosts),
    ]);
    const ordered = orderPoolByRanking(rows, metrics, cfg, subBoosts);
    return { rows: ordered, ranked: true, version: cfg.version, candidateCount };
  } catch {
    return { rows, ranked: false, version: "home_food_v1", candidateCount };
  }
}
