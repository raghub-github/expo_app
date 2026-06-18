import { getSql } from "../db/client.js";
import { executeOrderCancellationFinancials, lookupOrderContext } from "../lib/financial-rule-executor.js";
import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";
import { recordCancellationTimeline } from "../lib/order-cancellation-timeline.js";
import { recordOrderCancellation } from "../lib/record-order-cancellation.js";

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
          cancelled_by_type = 'system',
          -- Explicit ::text casts on the bound params inside jsonb_build_object.
          -- The function is variadic "any" so PostgreSQL cannot infer a type
          -- for a bare $N here and aborts with 42P18. Same param above is
          -- safe because it is assigned to a column with a known text type.
          cancellation_details = jsonb_build_object(
            'version', 1,
            'source', 'system',
            'action_source', 'system',
            'cancel_mode', 'auto',
            'rejected_reason', ${AUTO_CANCEL_REASON}::text,
            'cancelled_by_label', ${AUTO_CANCEL_REASON}::text
          ),
          updated_at = NOW()
        FROM targets t
        WHERE f.id = t.food_id
          AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
          AND f.cancelled_at IS NULL
        RETURNING f.order_id AS core_id, f.id AS food_id, f.merchant_store_id
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
        RETURNING c.id AS core_id, c.grand_total
      )
      SELECT f.core_id, f.food_id, f.merchant_store_id, c.grand_total
      FROM upd_food f
      JOIN upd_core c ON c.core_id = f.core_id
    `) as Array<{
      core_id: number;
      food_id: number;
      merchant_store_id: number;
      grand_total: unknown;
    }>;

    for (const row of cancelledRows) {
      const coreId = Number(row?.core_id);
      const foodId = Number(row?.food_id);
      const storeId = Number(row?.merchant_store_id);
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
        const orderCtx = await lookupOrderContext(coreId, sql);
        const engineResult = await executeOrderCancellationFinancials(
          {
            orderCoreId: coreId,
            ordersFoodId: foodId,
            coreOrderId: orderCtx.coreOrderId,
            merchantStoreId: storeId,
            previousStatus: "CREATED",
            cancelledByType: "system",
            orderGross: Number(row.grand_total ?? orderCtx.grandTotal),
            serviceType: orderCtx.serviceType,
          },
          sql
        );
        const refund = refundFieldsFromEngineResult(engineResult.raw);
        await recordOrderCancellation(sql, {
          orderCorePk: coreId,
          cancelledBy: "SYSTEM",
          displayReason: AUTO_CANCEL_REASON,
          cancelledByType: "system",
          cancelledByLabel: AUTO_CANCEL_REASON,
          actionSource: "system",
          cancelMode: "auto",
          previousStatus: "CREATED",
          grandTotal: row.grand_total,
          refundStatus: refund.refundStatus,
          refundAmount: refund.refundAmount,
          metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
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
