import { incrCounter } from "@gatimitra/logger";
import { getSql, withSqlRetry } from "../db/client.js";
import { getEnv } from "../config/env.js";

const DISPATCH_FRESHNESS_MINUTES = 10;

export type RiderLocationMaintenanceResult = {
  prunedRows: number;
  activeRidersOnline: number;
  currentLocationRows: number;
};

export async function refreshRiderLocationMonitoringMetrics(): Promise<void> {
  await withSqlRetry(async () => {
    const sql = getSql();
    const freshnessMinutes = DISPATCH_FRESHNESS_MINUTES;

    const [stats] = (await sql`
    WITH latest_duty AS (
      SELECT DISTINCT ON (dl.rider_id)
        dl.rider_id,
        dl.status
      FROM duty_logs dl
      ORDER BY dl.rider_id, dl.timestamp DESC
    ),
    online AS (
      SELECT COUNT(*)::int AS c
      FROM rider_current_locations rcl
      INNER JOIN latest_duty ld ON ld.rider_id = rcl.rider_id AND ld.status = 'ON'
      WHERE rcl.last_seen_at >= NOW() - (${freshnessMinutes} * INTERVAL '1 minute')
    ),
    locations AS (
      SELECT COUNT(*)::int AS c FROM rider_current_locations
    ),
    recent_events AS (
      SELECT COUNT(*)::int AS c
      FROM rider_location_events
      WHERE created_at >= NOW() - INTERVAL '1 minute'
    )
    SELECT
      (SELECT c FROM online) AS active_riders_online,
      (SELECT c FROM locations) AS current_location_rows,
      (SELECT c FROM recent_events) AS events_last_minute
  `) as Array<{
      active_riders_online: number;
      current_location_rows: number;
      events_last_minute: number;
    }>;

    incrCounter(
      "rider_location_active_online_gauge",
      "Riders on duty with fresh GPS (snapshot counter)",
      stats?.active_riders_online ?? 0
    );
    incrCounter(
      "rider_current_locations_rows_gauge",
      "Rows in rider_current_locations (snapshot counter)",
      stats?.current_location_rows ?? 0
    );
    incrCounter(
      "rider_location_events_per_minute_gauge",
      "rider_location_events inserts in the last minute (snapshot counter)",
      stats?.events_last_minute ?? 0
    );
  });
}

export async function runRiderLocationMaintenanceTick(): Promise<RiderLocationMaintenanceResult> {
  return withSqlRetry(async () => {
    const sql = getSql();
    const retentionDays = getEnv().RIDER_LOCATION_EVENT_RETENTION_DAYS;

    const [pruneResult] = (await sql`
    SELECT public.prune_rider_location_events(${retentionDays}) AS deleted
  `) as Array<{ deleted: number }>;

    await refreshRiderLocationMonitoringMetrics();

    const [stats] = (await sql`
    WITH latest_duty AS (
      SELECT DISTINCT ON (dl.rider_id)
        dl.rider_id,
        dl.status
      FROM duty_logs dl
      ORDER BY dl.rider_id, dl.timestamp DESC
    )
    SELECT
      (
        SELECT COUNT(*)::int
        FROM rider_current_locations rcl
        INNER JOIN latest_duty ld ON ld.rider_id = rcl.rider_id AND ld.status = 'ON'
        WHERE rcl.last_seen_at >= NOW() - (${DISPATCH_FRESHNESS_MINUTES} * INTERVAL '1 minute')
      ) AS active_riders_online,
      (SELECT COUNT(*)::int FROM rider_current_locations) AS current_location_rows
  `) as Array<{ active_riders_online: number; current_location_rows: number }>;

    incrCounter(
      "tick_runs_total",
      "Polling tick outcomes by lock state",
      1,
      { tick: "rider_location_maintenance", outcome: "ran" }
    );

    return {
      prunedRows: Number(pruneResult?.deleted ?? 0),
      activeRidersOnline: stats?.active_riders_online ?? 0,
      currentLocationRows: stats?.current_location_rows ?? 0,
    };
  });
}
