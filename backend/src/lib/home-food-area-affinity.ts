/**
 * Score city/locality peers with the same HOME_FOOD engine the customer app uses.
 * Uses the caller's SQL connection (partnersite, dashboard, and backend all share this).
 * Distance is equal for every store so the % is ranking quality, not a customer pin.
 * Affinity is each store's score as a percent of the top score in that area.
 */
import type { Sql } from "postgres";
import { rankStores } from "../modules/store-ranking/engine.js";
import { defaultConfigForProfile } from "../modules/store-ranking/default-config.js";
import type { RankingConfig, StoreFeatures } from "../modules/store-ranking/types.js";

export type HomeFoodAreaScore = {
  affinityPct: number;
  rank: number;
  score: number;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export async function scoreAreaStoresHomeFood(
  sql: Sql,
  storePks: number[]
): Promise<Map<number, HomeFoodAreaScore> | null> {
  const ids = [...new Set(storePks.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return new Map();

  const base = defaultConfigForProfile("HOME_FOOD");
  const cfgRows = await sql`
    SELECT enabled, version, weights, offer_weight, penalty_caps, boost_caps, refs, min_sample,
           subscription_plan_boosts
    FROM store_ranking_config
    WHERE profile = 'HOME_FOOD'
    LIMIT 1
  `;
  const row = cfgRows[0] as
    | {
        enabled?: boolean;
        version?: string;
        weights?: RankingConfig["weights"];
        offer_weight?: string | number;
        penalty_caps?: RankingConfig["penaltyCaps"];
        boost_caps?: RankingConfig["boostCaps"];
        refs?: RankingConfig["references"];
        min_sample?: number;
        subscription_plan_boosts?: Record<string, number>;
      }
    | undefined;
  if (!row || row.enabled !== true) return null;

  const cfg: RankingConfig = {
    ...base,
    version: row.version || base.version,
    enabled: true,
    weights: { ...base.weights, ...(row.weights ?? {}) },
    offerWeight: Number(row.offer_weight ?? base.offerWeight),
    penaltyCaps: { ...base.penaltyCaps, ...(row.penalty_caps ?? {}) },
    boostCaps: { ...base.boostCaps, ...(row.boost_caps ?? {}) },
    references: { ...base.references, ...(row.refs ?? {}) },
    minSample: Number(row.min_sample ?? base.minSample),
  };

  const metricRows = await sql`
    SELECT store_id, orders_7d, orders_30d, total_orders_30d, cancellation_rate, refund_rate,
           complaint_rate, avg_rating, rating_count, kpt_expected_min, kpt_actual_min, eta_actual_min
    FROM merchant_ranking_metrics
    WHERE store_id = ANY(${ids})
  `;
  const metrics = new Map<number, StoreFeatures>();
  for (const r of metricRows as unknown as Array<Record<string, unknown>>) {
    const storeId = num(r.store_id);
    metrics.set(storeId, {
      storeId,
      roadDistanceKm: 1,
      availabilityFraction: 1,
      oosRate: 0,
      avgRating: num(r.avg_rating),
      ratingCount: num(r.rating_count),
      promisedEtaMin: null,
      actualEtaMedianMin: r.eta_actual_min == null ? null : num(r.eta_actual_min),
      expectedKptMin: r.kpt_expected_min == null ? null : num(r.kpt_expected_min),
      actualKptMedianMin: r.kpt_actual_min == null ? null : num(r.kpt_actual_min),
      recentOrders: num(r.orders_7d),
      ratedSampleCount: num(r.total_orders_30d),
      cancellationRate: num(r.cancellation_rate),
      refundRate: num(r.refund_rate),
      complaintRate: num(r.complaint_rate),
    });
  }

  const planBoosts: Record<string, number> = {};
  for (const [k, v] of Object.entries(row.subscription_plan_boosts ?? {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) planBoosts[k.trim().toUpperCase()] = n;
  }
  const boosts = new Map<number, number>();
  if (Object.keys(planBoosts).length > 0) {
    const subRows = await sql`
      SELECT DISTINCT ON (store_id) store_id, plan_code_snapshot
      FROM merchant_subscriptions
      WHERE store_id = ANY(${ids})
        AND is_active = true
        AND subscription_status::text = 'ACTIVE'
        AND (expiry_date IS NULL OR expiry_date > now())
      ORDER BY store_id, start_date DESC
    `;
    for (const r of subRows as unknown as Array<{ store_id: number; plan_code_snapshot: string | null }>) {
      const code = String(r.plan_code_snapshot ?? "").trim().toUpperCase();
      boosts.set(Number(r.store_id), planBoosts[code] ?? 0);
    }
  }

  const neutral: StoreFeatures = {
    storeId: 0,
    roadDistanceKm: 1,
    availabilityFraction: 1,
    oosRate: 0,
    avgRating: 0,
    ratingCount: 0,
    promisedEtaMin: null,
    actualEtaMedianMin: null,
    expectedKptMin: null,
    actualKptMedianMin: null,
    recentOrders: 0,
    ratedSampleCount: 0,
    cancellationRate: 0,
    refundRate: 0,
    complaintRate: 0,
  };
  const ranked = rankStores(
    ids.map((id) => ({
      ...(metrics.get(id) ?? neutral),
      storeId: id,
      roadDistanceKm: 1,
      availabilityFraction: 1,
      oosRate: 0,
      subscriptionBoostRaw: boosts.get(id) ?? 0,
    })),
    cfg
  );
  if (ranked.length === 0 || ranked.every((r) => r.fallback || r.score <= 0)) return null;

  const top = ranked[0]?.score ?? 0;
  const out = new Map<number, HomeFoodAreaScore>();
  ranked.forEach((r, i) => {
    out.set(r.storeId, {
      score: r.score,
      rank: i + 1,
      affinityPct: top > 0 ? Math.round((1000 * r.score) / top) / 10 : 0,
    });
  });
  return out;
}
