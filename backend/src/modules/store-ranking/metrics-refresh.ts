/**
 * Store-ranking metrics refresh (Phase A). Recomputes merchant_ranking_metrics from existing
 * orders / ratings in ONE aggregation pass (single GROUP BY, no per-store loop, no per-request
 * work — §32). Scheduled every ~15 min under a Redis lock so only one replica runs.
 *
 * Windows: velocity 7d/30d (delivered food orders), negative-experience denominators 30d,
 * KPT expected vs actual median (prepared_at − accepted_at), delivery median (delivered_at −
 * placed_at). Rating is all-time (the engine applies Bayesian confidence). Refund/complaint
 * columns exist but are populated in a later pass (need refund-status + ticket→store linkage);
 * until then they stay 0 and the engine applies no penalty for them.
 */
import { getSql } from "../../db/client.js";

export type RankingMetricsRefreshResult = { storesUpserted: number };

export async function runMerchantRankingMetricsRefresh(): Promise<RankingMetricsRefreshResult> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO merchant_ranking_metrics (
      store_id, orders_7d, orders_30d, total_orders_30d, merchant_cancel_30d, cancellation_rate,
      avg_rating, rating_count, kpt_expected_min, kpt_actual_min, eta_actual_min, updated_at
    )
    SELECT
      s.store_id,
      s.orders_7d,
      s.orders_30d,
      s.total_30d,
      s.mcancel_30d,
      CASE WHEN s.total_30d > 0
        THEN round(s.mcancel_30d::numeric / s.total_30d, 4)
        ELSE 0 END,
      COALESCE(r.avg_rating, 0),
      COALESCE(r.rating_count, 0),
      s.kpt_expected,
      s.kpt_actual,
      s.eta_actual,
      now()
    FROM (
      SELECT
        oc.merchant_store_id AS store_id,
        COUNT(*) FILTER (
          WHERE of.delivered_at IS NOT NULL AND oc.created_at >= now() - interval '7 days'
        ) AS orders_7d,
        COUNT(*) FILTER (
          WHERE of.delivered_at IS NOT NULL AND oc.created_at >= now() - interval '30 days'
        ) AS orders_30d,
        COUNT(*) FILTER (WHERE oc.created_at >= now() - interval '30 days') AS total_30d,
        COUNT(*) FILTER (
          WHERE oc.created_at >= now() - interval '30 days'
            AND oc.cancelled_at IS NOT NULL
            AND lower(COALESCE(oc.cancelled_by, '')) LIKE '%merchant%'
        ) AS mcancel_30d,
        round(avg(of.preparation_time_minutes) FILTER (
          WHERE oc.created_at >= now() - interval '30 days' AND of.preparation_time_minutes IS NOT NULL
        )::numeric, 2) AS kpt_expected,
        round(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (of.prepared_at - of.accepted_at)) / 60.0
        ) FILTER (
          WHERE of.prepared_at IS NOT NULL AND of.accepted_at IS NOT NULL
            AND of.prepared_at > of.accepted_at
            AND oc.created_at >= now() - interval '30 days'
        )::numeric, 2) AS kpt_actual,
        round(percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (of.delivered_at - oc.placed_at)) / 60.0
        ) FILTER (
          WHERE of.delivered_at IS NOT NULL AND oc.placed_at IS NOT NULL
            AND of.delivered_at > oc.placed_at
            AND oc.created_at >= now() - interval '30 days'
        )::numeric, 2) AS eta_actual
      FROM orders_core oc
      JOIN orders_food of ON of.order_id = oc.id
      WHERE oc.order_type = 'food'
        AND oc.merchant_store_id IS NOT NULL
        AND oc.created_at >= now() - interval '30 days'
      GROUP BY oc.merchant_store_id
    ) s
    LEFT JOIN (
      SELECT store_id, round(avg(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS rating_count
      FROM merchant_store_ratings
      WHERE store_id IS NOT NULL
      GROUP BY store_id
    ) r ON r.store_id = s.store_id
    ON CONFLICT (store_id) DO UPDATE SET
      orders_7d = EXCLUDED.orders_7d,
      orders_30d = EXCLUDED.orders_30d,
      total_orders_30d = EXCLUDED.total_orders_30d,
      merchant_cancel_30d = EXCLUDED.merchant_cancel_30d,
      cancellation_rate = EXCLUDED.cancellation_rate,
      avg_rating = EXCLUDED.avg_rating,
      rating_count = EXCLUDED.rating_count,
      kpt_expected_min = EXCLUDED.kpt_expected_min,
      kpt_actual_min = EXCLUDED.kpt_actual_min,
      eta_actual_min = EXCLUDED.eta_actual_min,
      updated_at = now()
    RETURNING store_id
  `) as Array<{ store_id: number }>;

  return { storesUpserted: Array.isArray(rows) ? rows.length : 0 };
}
