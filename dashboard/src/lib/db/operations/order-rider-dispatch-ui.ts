import "server-only";

import { getSql } from "../client";

export type OrderRiderAssignmentSnapshot = {
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  dispatchManualHold: boolean;
  dispatchSessionActive: boolean;
};

async function readDispatchSessionActive(
  sql: ReturnType<typeof getSql>,
  orderCoreId: number,
  riderId: number | null
): Promise<boolean> {
  if (riderId != null) return false;
  try {
    const sessions = (await sql`
      SELECT status
      FROM order_dispatch_sessions
      WHERE order_core_id = ${orderCoreId}
      LIMIT 1
    `) as Array<{ status: string }>;
    return sessions[0]?.status === "active";
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
