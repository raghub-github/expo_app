import "server-only";

import { getSql } from "../client";

export type OrderRiderAssignmentSnapshot = {
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  dispatchManualHold: boolean;
  dispatchSessionActive: boolean;
};

async function readWaveIntervalSeconds(
  sql: ReturnType<typeof getSql>,
  serviceType: string
): Promise<number> {
  try {
    const rows = (await sql`
      SELECT wave_interval_seconds
      FROM platform_rider_dispatch_wave_settings
      WHERE service_type = ${serviceType}
      LIMIT 1
    `) as Array<{ wave_interval_seconds: number }>;
    const sec = Number(rows[0]?.wave_interval_seconds);
    if (Number.isFinite(sec) && sec > 0) return Math.round(sec);
  } catch {
    /* table may be absent in older envs */
  }
  return 120;
}

/**
 * True only while dispatch offers are live (session active + pending offers within wave window).
 * After the offer window elapses with no accept, manual assign must be clickable again.
 */
async function readDispatchSessionActive(
  sql: ReturnType<typeof getSql>,
  orderCoreId: number,
  riderId: number | null
): Promise<boolean> {
  if (riderId != null) return false;
  try {
    const sessions = (await sql`
      SELECT status, service_type
      FROM order_dispatch_sessions
      WHERE order_core_id = ${orderCoreId}
      LIMIT 1
    `) as Array<{ status: string; service_type: string | null }>;

    const session = sessions[0];
    if (!session || session.status !== "active") return false;

    const pendingRows = (await sql`
      SELECT
        COUNT(*)::int AS pending_count,
        MAX(a.created_at) AS latest_offer_at
      FROM order_rider_dispatch_assignment_audit a
      WHERE a.order_core_id = ${orderCoreId}
        AND a.event_type = 'offer_sent'
        AND NOT EXISTS (
          SELECT 1
          FROM order_rider_dispatch_assignment_audit o
          WHERE o.order_core_id = a.order_core_id
            AND o.rider_id = a.rider_id
            AND o.assignment_attempt_number = a.assignment_attempt_number
            AND o.event_type IN ('accepted', 'rejected', 'timeout')
        )
    `) as Array<{ pending_count: number; latest_offer_at: string | Date | null }>;

    const pendingCount = pendingRows[0]?.pending_count ?? 0;
    if (pendingCount <= 0) return false;

    const latestOfferAt = pendingRows[0]?.latest_offer_at;
    if (!latestOfferAt) return true;

    const waveIntervalSec = await readWaveIntervalSeconds(
      sql,
      session.service_type?.trim() || "food"
    );
    const elapsedMs = Date.now() - new Date(latestOfferAt).getTime();
    return elapsedMs < waveIntervalSec * 1000;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42P01") return false;
    throw err;
  }
}

/** Lightweight rider + dispatch UI flags for order detail polling. */
export async function getOrderRiderAssignmentSnapshot(
  orderCoreId: number
): Promise<OrderRiderAssignmentSnapshot | null> {
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) return null;

  const sql = getSql();

  try {
    const rows = (await sql`
      SELECT
        oc.rider_id AS "riderId",
        COALESCE(NULLIF(TRIM(r.name), ''), NULL) AS "riderName",
        COALESCE(NULLIF(TRIM(r.mobile), ''), NULL) AS "riderMobile",
        COALESCE(oc.dispatch_manual_hold, false) AS "dispatchManualHold"
      FROM orders_core oc
      LEFT JOIN riders r ON r.id = oc.rider_id
      WHERE oc.id = ${orderCoreId}
      LIMIT 1
    `) as Array<{
      riderId: number | null;
      riderName: string | null;
      riderMobile: string | null;
      dispatchManualHold: boolean;
    }>;

    const row = rows[0];
    if (!row) return null;

    const riderId = row.riderId != null ? Number(row.riderId) : null;
    const dispatchSessionActive = await readDispatchSessionActive(sql, orderCoreId, riderId);

    return {
      riderId,
      riderName: row.riderName?.trim() || null,
      riderMobile: row.riderMobile?.trim() || null,
      dispatchManualHold: row.dispatchManualHold === true,
      dispatchSessionActive,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;

    const rows = (await sql`
      SELECT
        oc.rider_id AS "riderId",
        COALESCE(NULLIF(TRIM(r.name), ''), NULL) AS "riderName",
        COALESCE(NULLIF(TRIM(r.mobile), ''), NULL) AS "riderMobile"
      FROM orders_core oc
      LEFT JOIN riders r ON r.id = oc.rider_id
      WHERE oc.id = ${orderCoreId}
      LIMIT 1
    `) as Array<{
      riderId: number | null;
      riderName: string | null;
      riderMobile: string | null;
    }>;

    const row = rows[0];
    if (!row) return null;

    const riderId = row.riderId != null ? Number(row.riderId) : null;
    const dispatchSessionActive = await readDispatchSessionActive(sql, orderCoreId, riderId);

    return {
      riderId,
      riderName: row.riderName?.trim() || null,
      riderMobile: row.riderMobile?.trim() || null,
      dispatchManualHold: false,
      dispatchSessionActive,
    };
  }
}
