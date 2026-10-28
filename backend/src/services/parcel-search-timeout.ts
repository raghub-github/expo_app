import { getSql, withSqlRetry } from "../db/client.js";
import { autoCancelExpiredParcelOrder } from "../modules/parcel/parcelPlacement.service.js";
import { completeOrderDispatch } from "../lib/order-dispatch.service.js";

/**
 * Auto-cancel parcel orders whose rider search window expired without assignment.
 * (No tip-boost pause — parcels cancel on first expiry, same 4 min window as rides.)
 */
export async function runParcelSearchTimeoutTick(log: {
  info: (o: object, msg?: string) => void;
  error: (o: object, msg?: string) => void;
}): Promise<void> {
  try {
    await withSqlRetry(async () => {
      const sql = getSql();

      const rows = (await sql`
      SELECT oc.id AS core_id
      FROM orders_core oc
      INNER JOIN orders_parcel op ON op.order_id = oc.id
      WHERE oc.order_type = 'parcel'
        AND oc.status = 'assigned'
        AND oc.rider_id IS NULL
        AND op.cancelled_at IS NULL
        AND op.search_expires_at IS NOT NULL
        AND op.search_expires_at <= NOW()
      ORDER BY op.search_expires_at ASC
      LIMIT 100
    `) as Array<{ core_id: number }>;

      let cancelled = 0;
      for (const row of rows) {
        const coreId = Number(row?.core_id);
        if (!Number.isFinite(coreId) || coreId <= 0) continue;
        try {
          const ok = await autoCancelExpiredParcelOrder(coreId);
          if (ok) {
            await completeOrderDispatch(coreId, "expired");
            cancelled += 1;
          }
        } catch (err) {
          log.error({ err, coreId }, "parcel_search_timeout_cancel_failed");
        }
      }

      if (cancelled > 0) {
        log.info({ cancelled }, "parcel_search_timeout_tick");
      }
    });
  } catch (err) {
    log.error({ err }, "parcel_search_timeout_tick_failed");
  }
}
