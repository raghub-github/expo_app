import { getSql } from "../db/client.js";
import { recordCancellationTimeline } from "../lib/order-cancellation-timeline.js";

const AUTO_CANCEL_REASON = "Auto Cancelled";

/**
 * Auto-cancel unaccepted orders after the configured acceptance window per store.
 * Writes orders_food / orders_core + order_timelines "Cancelled" (idempotent).
 */
export async function runOrderAcceptanceTimeoutTick(log: {
  info: (o: object, msg?: string) => void;
  error: (o: object, msg?: string) => void;
}): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString();

  try {
    const cancelledRows = (await sql`
      WITH cfg AS (
        SELECT
          store_type,
          COALESCE(acceptance_window_minutes, 5) AS win_m
        FROM platform_food_acceptance_settings_by_store_type
      ),
      targets AS (
        SELECT
          f.id AS food_id,
          f.order_id AS core_id,
          f.merchant_store_id,
          COALESCE(cfg.win_m, 5) AS win_m
        FROM orders_food f
        LEFT JOIN merchant_stores s ON s.id = f.merchant_store_id
        LEFT JOIN cfg ON cfg.store_type = COALESCE(s.store_type::text, 'GENERAL')
        WHERE upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
          AND f.cancelled_at IS NULL
          AND (NOW() - f.created_at) > make_interval(mins => COALESCE(cfg.win_m, 5))
        ORDER BY f.created_at ASC
        LIMIT 200
      ),
      upd_food AS (
        UPDATE orders_food f
        SET
          order_status = 'CANCELLED',
          cancelled_at = NOW(),
          rejected_reason = ${AUTO_CANCEL_REASON},
          cancelled_by_label = ${AUTO_CANCEL_REASON},
          updated_at = NOW()
        FROM targets t
        WHERE f.id = t.food_id
          AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
          AND f.cancelled_at IS NULL
        RETURNING f.order_id AS core_id, f.id AS food_id
      ),
      upd_core AS (
        UPDATE orders_core c
        SET
          status = 'cancelled',
          current_status = 'CANCELLED',
          cancelled_at = NOW(),
          cancelled_by = 'SYSTEM',
          updated_at = NOW()
        FROM upd_food u
        WHERE c.id = u.core_id
          AND c.cancelled_at IS NULL
        RETURNING c.id AS core_id
      )
      SELECT core_id FROM upd_core
    `) as Array<{ core_id: number }>;

    for (const row of cancelledRows) {
      const coreId = Number(row?.core_id);
      if (!Number.isFinite(coreId) || coreId <= 0) continue;
      try {
        await recordCancellationTimeline(sql, {
          orderCorePk: coreId,
          previousStatus: "Pymt Assign RX",
          rejectedReason: AUTO_CANCEL_REASON,
          actorType: "system",
          cancelMode: "auto",
          statusMessage: AUTO_CANCEL_REASON,
        });
      } catch (tlErr) {
        log.error({ err: tlErr, coreId }, "order_acceptance_timeout_timeline_failed");
      }
    }

    const cancelled = cancelledRows.length;
    if (cancelled > 0) {
      log.info({ cancelled, now }, "order_acceptance_timeout_tick");
    }
  } catch (e) {
    log.error({ err: e, now }, "order_acceptance_timeout_tick_failed");
  }
}
