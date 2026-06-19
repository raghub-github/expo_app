/**
 * ETA accuracy analytics — reporting hooks for admin dashboard.
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
