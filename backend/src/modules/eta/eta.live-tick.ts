/**
 * Periodic live ETA tick — recalculates all active food orders.
 */
import { getSql, withSqlRetry } from "../../db/client.js";
import { runLiveEtaForOrder } from "./eta.live-engine.js";

export type LiveEtaTickResult = {
  scanned: number;
  updated: number;
  errors: number;
};

export async function runLiveEtaTick(limit = 200): Promise<LiveEtaTickResult> {
  const rows = await withSqlRetry(async () => {
    const sql = getSql();
    // Static IN list — avoids postgres.js binding a JS array as a malformed
    // text literal ("a,b,c") instead of a Postgres text[] ("{a,b,c}").
    return await sql<Array<{ order_id: string }>>`
      SELECT oc.order_id
      FROM orders_core oc
      WHERE oc.order_type = 'food'
        AND oc.status::text IN (
          'assigned',
          'accepted',
          'reached_store',
          'picked_up',
          'in_transit'
        )
        AND oc.order_id IS NOT NULL
      ORDER BY COALESCE(oc.live_eta_updated_at, oc.updated_at) ASC NULLS FIRST
      LIMIT ${limit}
    `;
  });

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    const orderIdText = row.order_id?.trim();
    if (!orderIdText) continue;
    try {
      const result = await runLiveEtaForOrder(orderIdText, "STATUS_CHANGE");
      if (result?.changed) updated += 1;
    } catch (e) {
      errors += 1;
      console.warn("[eta] live tick failed", orderIdText, (e as Error).message);
    }
  }

  return { scanned: rows.length, updated, errors };
}
