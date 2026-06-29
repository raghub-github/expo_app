import type { Sql } from "postgres";
import { getSql, withSqlRetry } from "../db/client.js";
import { executeOrderCancellationFinancials, lookupOrderContext } from "../lib/financial-rule-executor.js";
import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";
import { recordCancellationTimeline } from "../lib/order-cancellation-timeline.js";
import { recordOrderCancellation } from "../lib/record-order-cancellation.js";
import { applyMerchantOrderCancellationLedger } from "../lib/apply-merchant-cancellation-ledger.js";

const AUTO_CANCEL_REASON = "Auto Cancelled";

type TimeoutLog = {
  info: (o: object, msg?: string) => void;
  error: (o: object, msg?: string) => void;
};

type CancelledRow = {
  core_id: number;
  food_id: number;
  merchant_store_id: number;
  grand_total: unknown;
};

type AutoAcceptTarget = {
  food_id: number;
  merchant_store_id: number;
};

/** Expired if persisted deadline passed, or legacy created_at + platform window. */
const EXPIRED_ACCEPTANCE_PREDICATE = `
  (
    f.merchant_acceptance_deadline_at IS NOT NULL
    AND f.merchant_acceptance_deadline_at < NOW()
  )
  OR (
    f.merchant_acceptance_deadline_at IS NULL
    AND (NOW() - f.created_at) > make_interval(mins => COALESCE(cfg.win_m, 5))
  )
`;

async function fetchExpiredAcceptanceTargets(
  sql: Sql,
  options: { merchantStoreId?: number; limit?: number } = {}
): Promise<CancelledRow[]> {
  const limit = Math.max(1, Math.min(500, options.limit ?? 200));
  const storeId = options.merchantStoreId;

  if (storeId != null && Number.isFinite(storeId) && storeId > 0) {
    return (await sql.unsafe(`
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
        WHERE f.merchant_store_id = $1
          AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
          AND f.cancelled_at IS NULL
          AND (${EXPIRED_ACCEPTANCE_PREDICATE})
        ORDER BY f.created_at ASC
        LIMIT $2
      ),
      upd_food AS (
        UPDATE orders_food f
        SET
          order_status = 'CANCELLED',
          cancelled_at = NOW(),
          rejected_reason = $3,
          cancelled_by_label = $3,
          cancelled_by_type = 'system',
          cancellation_details = jsonb_build_object(
            'version', 1,
            'source', 'system',
            'action_source', 'system',
            'cancel_mode', 'auto',
            'rejected_reason', $3::text,
            'cancelled_by_label', $3::text
          ),
          merchant_acceptance_timeout_processed_at = NOW(),
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
    `, [storeId, limit, AUTO_CANCEL_REASON])) as CancelledRow[];
  }

  return (await sql.unsafe(`
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
        AND (${EXPIRED_ACCEPTANCE_PREDICATE})
      ORDER BY f.created_at ASC
      LIMIT $1
    ),
    upd_food AS (
      UPDATE orders_food f
      SET
        order_status = 'CANCELLED',
        cancelled_at = NOW(),
        rejected_reason = $2,
        cancelled_by_label = $2,
        cancelled_by_type = 'system',
        cancellation_details = jsonb_build_object(
          'version', 1,
          'source', 'system',
          'action_source', 'system',
          'cancel_mode', 'auto',
          'rejected_reason', $2::text,
          'cancelled_by_label', $2::text
        ),
        merchant_acceptance_timeout_processed_at = NOW(),
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
  `, [limit, AUTO_CANCEL_REASON])) as CancelledRow[];
}

async function fetchAutoAcceptTargets(
  sql: Sql,
  options: { merchantStoreId?: number; limit?: number } = {}
): Promise<AutoAcceptTarget[]> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const storeId = options.merchantStoreId;

  const storeFilter =
    storeId != null && Number.isFinite(storeId) && storeId > 0
      ? sql`AND f.merchant_store_id = ${storeId}`
      : sql``;

  return (await sql`
    SELECT f.id AS food_id, f.merchant_store_id
    FROM orders_food f
    INNER JOIN merchant_store_settings mss ON mss.store_id = f.merchant_store_id
    WHERE mss.auto_accept_orders = TRUE
      AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
      AND f.cancelled_at IS NULL
      AND f.accepted_at IS NULL
      AND (
        f.created_at + make_interval(secs => GREATEST(0, LEAST(600, COALESCE(mss.auto_accept_time_seconds, 30)))::double precision)
      ) <= NOW()
      AND (
        f.merchant_acceptance_deadline_at IS NULL
        OR f.merchant_acceptance_deadline_at > NOW()
      )
      ${storeFilter}
    ORDER BY f.created_at ASC
    LIMIT ${limit}
  `) as AutoAcceptTarget[];
}

async function finalizeCancelledRow(
  sql: Sql,
  row: CancelledRow,
  log: TimeoutLog
): Promise<void> {
  const coreId = Number(row?.core_id);
  const foodId = Number(row?.food_id);
  const storeId = Number(row?.merchant_store_id);
  if (!Number.isFinite(coreId) || coreId <= 0) return;
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
    try {
      await applyMerchantOrderCancellationLedger(
        {
          orderCoreId: coreId,
          source: "system_auto_cancel",
        },
        sql
      );
    } catch (ledgerErr) {
      log.error({ err: ledgerErr, coreId }, "order_acceptance_timeout_ledger_failed");
    }
  } catch (tlErr) {
    log.error({ err: tlErr, coreId }, "order_acceptance_timeout_timeline_failed");
  }
}

async function finalizeCancelledRows(
  sql: Sql,
  cancelledRows: CancelledRow[],
  log: TimeoutLog
): Promise<void> {
  const chunkSize = 4;
  for (let i = 0; i < cancelledRows.length; i += chunkSize) {
    const chunk = cancelledRows.slice(i, i + chunkSize);
    await Promise.all(chunk.map((row) => finalizeCancelledRow(sql, row, log)));
  }
}

async function processAutoAcceptTargets(
  sql: Sql,
  targets: AutoAcceptTarget[],
  log: TimeoutLog
): Promise<number> {
  if (targets.length === 0) return 0;

  const { patchMerchantFoodOrderStatus } = await import(
    "../modules/merchant-partner/merchant-food-orders.service.js"
  );

  let accepted = 0;
  for (const row of targets) {
    const foodId = Number(row.food_id);
    const storeId = Number(row.merchant_store_id);
    if (!Number.isFinite(foodId) || !Number.isFinite(storeId)) continue;
    try {
      await patchMerchantFoodOrderStatus(sql, storeId, foodId, "ACCEPTED", undefined, {
        actionSource: "system",
        actionMode: "auto",
      });
      accepted += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/invalid_transition/i.test(msg)) {
        log.error({ err: e, foodId, storeId }, "order_auto_accept_failed");
      }
    }
  }
  return accepted;
}

/**
 * Auto-cancel unaccepted orders after the configured acceptance window per store.
 * Writes orders_food / orders_core + order_timelines "Cancelled" (idempotent).
 */
export async function runOrderAcceptanceTimeoutTick(log: TimeoutLog): Promise<void> {
  const now = new Date().toISOString();

  try {
    await withSqlRetry(async () => {
      const sql = getSql();
      const autoAcceptTargets = await fetchAutoAcceptTargets(sql, { limit: 50 });
      const autoAccepted = await processAutoAcceptTargets(sql, autoAcceptTargets, log);

      const cancelledRows = await fetchExpiredAcceptanceTargets(sql, { limit: 200 });
      await finalizeCancelledRows(sql, cancelledRows, log);

      const cancelled = cancelledRows.length;
      if (cancelled > 0 || autoAccepted > 0) {
        log.info({ cancelled, autoAccepted, now }, "order_acceptance_timeout_tick");
      }
    });
  } catch (e) {
    log.error({ err: e, now }, "order_acceptance_timeout_tick_failed");
  }
}

/** Flush expired unaccepted orders for one store (portal open / mobile sync). */
export async function syncOrderAcceptanceTimeoutForStore(
  merchantStoreId: number,
  log: TimeoutLog
): Promise<{ cancelled: number; auto_accepted: number }> {
  const sql = getSql();
  const now = new Date().toISOString();

  try {
    const autoAcceptTargets = await fetchAutoAcceptTargets(sql, {
      merchantStoreId,
      limit: 50,
    });
    const autoAccepted = await processAutoAcceptTargets(sql, autoAcceptTargets, log);

    const cancelledRows = await fetchExpiredAcceptanceTargets(sql, {
      merchantStoreId,
      limit: 200,
    });
    await finalizeCancelledRows(sql, cancelledRows, log);

    const cancelled = cancelledRows.length;
    if (cancelled > 0 || autoAccepted > 0) {
      log.info({ cancelled, autoAccepted, merchantStoreId, now }, "order_acceptance_timeout_store_sync");
    }
    return { cancelled, auto_accepted: autoAccepted };
  } catch (e) {
    log.error({ err: e, merchantStoreId, now }, "order_acceptance_timeout_store_sync_failed");
    return { cancelled: 0, auto_accepted: 0 };
  }
}
