import { getSql } from "../db/client.js";

/**
 * Auto-cancel unaccepted orders after the configured acceptance window per store.
 *
 * NOTE:
 * - Partnersite + Merchant app show the same countdown (they read the same settings table).
 * - Backend enforces auto-cancel even if the merchant closes/dismisses the modal or is offline.
 */
export async function runOrderAcceptanceTimeoutTick(log: {
  info: (o: object, msg?: string) => void;
  error: (o: object, msg?: string) => void;
}): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString();

  try {
    // Cancel food orders that are still in CREATED pipeline (or legacy NEW/PLACED).
    // This is intentionally conservative and idempotent.
    const rows = (await sql`
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
          AND (f.cancelled_at IS NULL)
          AND (NOW() - f.created_at) > make_interval(mins => COALESCE(cfg.win_m, 5))
        ORDER BY f.created_at ASC
        LIMIT 200
      ),
      upd_food AS (
        UPDATE orders_food f
        SET
          order_status = 'CANCELLED',
          cancelled_at = NOW(),
          rejected_reason = 'Auto Cancelled: acceptance timeout',
          updated_at = NOW()
        FROM targets t
        WHERE f.id = t.food_id
          AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
          AND f.cancelled_at IS NULL
        RETURNING f.order_id
      )
      UPDATE orders_core c
      SET
        status = 'cancelled',
        current_status = 'CANCELLED',
        cancelled_at = NOW(),
        cancelled_by = 'SYSTEM',
        updated_at = NOW()
      WHERE c.id IN (SELECT order_id FROM upd_food)
        AND c.cancelled_at IS NULL
      RETURNING c.id
    `) as any[];

    const cancelled = Array.isArray(rows) ? rows.length : 0;
    if (cancelled > 0) {
      log.info({ cancelled, now }, "order_acceptance_timeout_tick");
    }
  } catch (e) {
    log.error({ err: e, now }, "order_acceptance_timeout_tick_failed");
  }
}

