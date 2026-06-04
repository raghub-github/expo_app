import { getSql } from "../db/client.js";
import { autoCancelExpiredRideOrder } from "../modules/rides/ride.placement.service.js";
import { completeOrderDispatch } from "../lib/order-dispatch.service.js";
import { RIDE_MAX_SEARCH_EXTENSIONS } from "../modules/rides/ride.tip-boost.service.js";

/**
 * Auto-cancel person_ride orders whose rider search window expired without assignment.
 * First expiry → awaiting_tip_boost (customer tip sheet). After extension(s) expire → cancel.
 */
export async function runRideSearchTimeoutTick(log: {
  info: (o: object, msg?: string) => void;
  error: (o: object, msg?: string) => void;
}): Promise<void> {
  const sql = getSql();

  try {
    const rows = (await sql`
      SELECT oc.id AS core_id, or2.dispatch_retry_count, or2.awaiting_tip_boost
      FROM orders_core oc
      INNER JOIN orders_ride or2 ON or2.order_id = oc.id
      WHERE oc.order_type = 'person_ride'
        AND oc.status = 'assigned'
        AND oc.rider_id IS NULL
        AND or2.cancelled_at IS NULL
        AND or2.search_expires_at IS NOT NULL
        AND or2.search_expires_at <= NOW()
        AND or2.awaiting_tip_boost = false
      ORDER BY or2.search_expires_at ASC
      LIMIT 100
    `) as Array<{
      core_id: number;
      dispatch_retry_count: number | null;
      awaiting_tip_boost: boolean | null;
    }>;

    let cancelled = 0;
    let paused = 0;
    for (const row of rows) {
      const coreId = Number(row?.core_id);
      if (!Number.isFinite(coreId) || coreId <= 0) continue;
      const retryCount = Number(row.dispatch_retry_count ?? 0);

      try {
        if (retryCount < RIDE_MAX_SEARCH_EXTENSIONS) {
          await sql`
            UPDATE orders_ride
            SET awaiting_tip_boost = true, updated_at = NOW()
            WHERE order_id = ${coreId} AND cancelled_at IS NULL
          `;
          paused += 1;
          continue;
        }

        const ok = await autoCancelExpiredRideOrder(coreId);
        if (ok) {
          await completeOrderDispatch(coreId, "expired");
          cancelled += 1;
        }
      } catch (err) {
        log.error({ err, coreId }, "ride_search_timeout_cancel_failed");
      }
    }

    if (cancelled > 0 || paused > 0) {
      log.info({ cancelled, paused }, "ride_search_timeout_tick");
    }
  } catch (err) {
    log.error({ err }, "ride_search_timeout_tick_failed");
  }
}
