/**
 * ETA accuracy analytics — reporting hooks for admin dashboard.
 * Accuracy snapshots (delivery outcome) + history-based drift foundation.
 */
import { getSql } from "../../db/client.js";

export type EtaAnalyticsSummary = {
  avgEtaAccuracyMinutes: number | null;
  merchantDelayPct: number | null;
  avgRiderWaitMinutes: number | null;
  deliveredFasterCount: number;
  deliveredLateCount: number;
  deliveredOnTimeCount: number;
  sampleSize: number;
};

export async function getEtaAnalyticsSummary(days = 30): Promise<EtaAnalyticsSummary> {
  const sql = getSql();
  const windowDays = Math.max(1, Math.min(365, Math.round(days)));

  try {
    const rows = await sql<
      Array<{
        sample_size: string;
        avg_delta: string | null;
        delay_pct: string | null;
        avg_rider_wait: string | null;
        faster_count: string;
        late_count: string;
        on_time_count: string;
      }>
    >`
      SELECT
        COUNT(*)::text AS sample_size,
        AVG(ABS(delta_minutes))::text AS avg_delta,
        (100.0 * AVG(CASE WHEN merchant_delayed THEN 1 ELSE 0 END))::text AS delay_pct,
        AVG(rider_wait_minutes)::text AS avg_rider_wait,
        COUNT(*) FILTER (WHERE delivered_faster_than_promised = TRUE)::text AS faster_count,
        COUNT(*) FILTER (WHERE delta_minutes > 2)::text AS late_count,
        COUNT(*) FILTER (WHERE delivered_on_time = TRUE)::text AS on_time_count
      FROM order_eta_accuracy_snapshots
      WHERE created_at >= NOW() - (${windowDays}::text || ' days')::interval
    `;
    const r = rows[0];
    return {
      sampleSize: Number(r?.sample_size ?? 0),
      avgEtaAccuracyMinutes: r?.avg_delta != null ? Number(r.avg_delta) : null,
      merchantDelayPct: r?.delay_pct != null ? Number(r.delay_pct) : null,
      avgRiderWaitMinutes: r?.avg_rider_wait != null ? Number(r.avg_rider_wait) : null,
      deliveredFasterCount: Number(r?.faster_count ?? 0),
      deliveredLateCount: Number(r?.late_count ?? 0),
      deliveredOnTimeCount: Number(r?.on_time_count ?? 0),
    };
  } catch {
    return {
      sampleSize: 0,
      avgEtaAccuracyMinutes: null,
      merchantDelayPct: null,
      avgRiderWaitMinutes: null,
      deliveredFasterCount: 0,
      deliveredLateCount: 0,
      deliveredOnTimeCount: 0,
    };
  }
}

/**
 * Drift / SLA foundation from immutable order_eta_history.
 * No schema changes needed for future dashboards — query these aggregates.
 */
export type EtaDriftAnalytics = {
  sampleSize: number;
  avgAbsDeltaMinutes: number | null;
  avgSignedDeltaMinutes: number | null;
  merchantDelayEvents: number;
  trafficEvents: number;
  weatherEvents: number;
  statusChangeEvents: number;
  byReason: Array<{ reason: string; count: number; avgAbsDelta: number | null }>;
  byStage: Array<{ stage: string; count: number; avgDisplayEta: number | null }>;
};

export async function getEtaDriftAnalytics(args?: {
  days?: number;
  merchantStoreId?: number;
}): Promise<EtaDriftAnalytics> {
  const sql = getSql();
  const windowDays = Math.max(1, Math.min(365, Math.round(args?.days ?? 30)));
  const storeId = args?.merchantStoreId ?? null;

  const empty: EtaDriftAnalytics = {
    sampleSize: 0,
    avgAbsDeltaMinutes: null,
    avgSignedDeltaMinutes: null,
    merchantDelayEvents: 0,
    trafficEvents: 0,
    weatherEvents: 0,
    statusChangeEvents: 0,
    byReason: [],
    byStage: [],
  };

  try {
    const summary = await sql<
      Array<{
        sample_size: string;
        avg_abs: string | null;
        avg_signed: string | null;
        merchant_delay: string;
        traffic: string;
        weather: string;
        status_change: string;
      }>
    >`
      SELECT
        COUNT(*)::text AS sample_size,
        AVG(ABS(COALESCE(
          delta_minutes,
          NULLIF((metadata->>'deltaMinutes')::numeric, 'NaN')
        )))::text AS avg_abs,
        AVG(COALESCE(
          delta_minutes,
          NULLIF((metadata->>'deltaMinutes')::numeric, 'NaN')
        ))::text AS avg_signed,
        COUNT(*) FILTER (WHERE recalc_reason = 'MERCHANT_DELAY')::text AS merchant_delay,
        COUNT(*) FILTER (WHERE recalc_reason = 'TRAFFIC_UPDATE')::text AS traffic,
        COUNT(*) FILTER (WHERE recalc_reason = 'WEATHER_UPDATE')::text AS weather,
        COUNT(*) FILTER (WHERE recalc_reason = 'STATUS_CHANGE')::text AS status_change
      FROM order_eta_history
      WHERE created_at >= NOW() - (${windowDays}::text || ' days')::interval
        AND (${storeId}::bigint IS NULL OR merchant_store_id = ${storeId})
    `;

    const byReason = await sql<
      Array<{ reason: string; cnt: string; avg_abs: string | null }>
    >`
      SELECT recalc_reason AS reason,
             COUNT(*)::text AS cnt,
             AVG(ABS(COALESCE(
               delta_minutes,
               NULLIF((metadata->>'deltaMinutes')::numeric, 'NaN')
             )))::text AS avg_abs
      FROM order_eta_history
      WHERE created_at >= NOW() - (${windowDays}::text || ' days')::interval
        AND (${storeId}::bigint IS NULL OR merchant_store_id = ${storeId})
      GROUP BY recalc_reason
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `;

    const byStage = await sql<
      Array<{ stage: string; cnt: string; avg_display: string | null }>
    >`
      SELECT COALESCE(
               current_stage,
               metadata->'stageAware'->>'currentStage',
               'UNKNOWN'
             ) AS stage,
             COUNT(*)::text AS cnt,
             AVG(COALESCE(
               display_eta_minutes,
               NULLIF((metadata->'stageAware'->>'displayEta')::numeric, 'NaN')
             ))::text AS avg_display
      FROM order_eta_history
      WHERE created_at >= NOW() - (${windowDays}::text || ' days')::interval
        AND (${storeId}::bigint IS NULL OR merchant_store_id = ${storeId})
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `;

    const r = summary[0];
    return {
      sampleSize: Number(r?.sample_size ?? 0),
      avgAbsDeltaMinutes: r?.avg_abs != null ? Number(r.avg_abs) : null,
      avgSignedDeltaMinutes: r?.avg_signed != null ? Number(r.avg_signed) : null,
      merchantDelayEvents: Number(r?.merchant_delay ?? 0),
      trafficEvents: Number(r?.traffic ?? 0),
      weatherEvents: Number(r?.weather ?? 0),
      statusChangeEvents: Number(r?.status_change ?? 0),
      byReason: byReason.map((x) => ({
        reason: x.reason,
        count: Number(x.cnt),
        avgAbsDelta: x.avg_abs != null ? Number(x.avg_abs) : null,
      })),
      byStage: byStage.map((x) => ({
        stage: x.stage,
        count: Number(x.cnt),
        avgDisplayEta: x.avg_display != null ? Number(x.avg_display) : null,
      })),
    };
  } catch {
    return empty;
  }
}
