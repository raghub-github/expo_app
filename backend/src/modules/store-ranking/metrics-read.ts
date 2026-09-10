/**
 * Batched read of pre-aggregated ranking metrics + pure mapping into the engine's StoreFeatures
 * (historical part only). The request path calls loadRankingMetricsForStores() ONCE with all
 * candidate store ids (single ANY() lookup, no N+1); the live part of StoreFeatures
 * (roadDistanceKm, availabilityFraction, oosRate, promisedEta) is merged in by the caller at
 * request time (Phase B-wire).
 */
import { getSql } from "../../db/client.js";
import type { StoreFeatures } from "./types.js";

export type RankingMetricsRow = {
  storeId: number;
  orders7d: number;
  orders30d: number;
  totalOrders30d: number;
  cancellationRate: number;
  refundRate: number;
  complaintRate: number;
  avgRating: number;
  ratingCount: number;
  kptExpectedMin: number | null;
  kptActualMin: number | null;
  etaActualMin: number | null;
  updatedAt: string | null;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** One batched lookup for all candidate stores. Missing stores simply have no row (→ neutral). */
export async function loadRankingMetricsForStores(
  storeIds: number[]
): Promise<Map<number, RankingMetricsRow>> {
  const ids = Array.from(new Set(storeIds.filter((n) => Number.isFinite(n) && n > 0)));
  const out = new Map<number, RankingMetricsRow>();
  if (ids.length === 0) return out;
  const sql = getSql();
  const rows = (await sql`
    SELECT store_id, orders_7d, orders_30d, total_orders_30d, cancellation_rate, refund_rate,
           complaint_rate, avg_rating, rating_count, kpt_expected_min, kpt_actual_min,
           eta_actual_min, updated_at
    FROM merchant_ranking_metrics
    WHERE store_id = ANY(${ids})
  `) as Array<Record<string, unknown>>;
  for (const r of rows) {
    const storeId = num(r.store_id);
    out.set(storeId, {
      storeId,
      orders7d: num(r.orders_7d),
      orders30d: num(r.orders_30d),
      totalOrders30d: num(r.total_orders_30d),
      cancellationRate: num(r.cancellation_rate),
      refundRate: num(r.refund_rate),
      complaintRate: num(r.complaint_rate),
      avgRating: num(r.avg_rating),
      ratingCount: num(r.rating_count),
      kptExpectedMin: numOrNull(r.kpt_expected_min),
      kptActualMin: numOrNull(r.kpt_actual_min),
      etaActualMin: numOrNull(r.eta_actual_min),
      updatedAt: r.updated_at == null ? null : String(r.updated_at),
    });
  }
  return out;
}

/** Neutral historical features for a store with no metrics row yet (new / no recent orders). */
export function neutralHistoricalFeatures(): Pick<
  StoreFeatures,
  | "avgRating"
  | "ratingCount"
  | "promisedEtaMin"
  | "actualEtaMedianMin"
  | "expectedKptMin"
  | "actualKptMedianMin"
  | "recentOrders"
  | "cancellationRate"
  | "refundRate"
  | "complaintRate"
> {
  return {
    avgRating: 0,
    ratingCount: 0,
    promisedEtaMin: null,
    actualEtaMedianMin: null,
    expectedKptMin: null,
    actualKptMedianMin: null,
    recentOrders: 0,
    cancellationRate: 0,
    refundRate: 0,
    complaintRate: 0,
  };
}

/**
 * Pure mapping from a metrics row to the HISTORICAL slice of StoreFeatures. Live signals
 * (distance/availability/oos/promised-ETA/boosts) are layered on by the caller. Promised ETA is
 * left null here (not yet captured historically) so the engine treats ETA reliability as neutral
 * until instrumented; KPT reliability (expected vs actual) is fully populated.
 */
export function metricsToHistoricalFeatures(
  row: RankingMetricsRow | undefined
): ReturnType<typeof neutralHistoricalFeatures> {
  if (!row) return neutralHistoricalFeatures();
  return {
    avgRating: row.avgRating,
    ratingCount: row.ratingCount,
    promisedEtaMin: null,
    actualEtaMedianMin: row.etaActualMin,
    expectedKptMin: row.kptExpectedMin,
    actualKptMedianMin: row.kptActualMin,
    recentOrders: row.orders7d,
    cancellationRate: row.cancellationRate,
    refundRate: row.refundRate,
    complaintRate: row.complaintRate,
  };
}
