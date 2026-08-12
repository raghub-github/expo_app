import type { Sql } from "postgres";
import { getSql, withSqlRetry } from "../db/client.js";
import { executeOrderCancellationFinancials, lookupOrderContext } from "../lib/financial-rule-executor.js";
import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";
import { recordCancellationTimeline } from "../lib/order-cancellation-timeline.js";
import { recordOrderCancellation } from "../lib/record-order-cancellation.js";
import { applyMerchantOrderCancellationLedger } from "../lib/apply-merchant-cancellation-ledger.js";
import { autoRefundOnCancellation } from "../lib/auto-refund-on-cancellation.js";
import { clearMerchantStoreOrderNotifications } from "../lib/clear-merchant-order-notifications.js";
import { emitEvent } from "../modules/notifications/eventBus.js";

/** Machine reason code — Super Admin accept window expiry (single source of truth). */
export const MERCHANT_ACCEPT_TIMEOUT_REASON = "MERCHANT_ACCEPT_TIMEOUT";
/** Human-readable label shown on timelines / merchant cards. */
export const MERCHANT_ACCEPT_TIMEOUT_LABEL = "Auto Cancelled";

/** Unaccepted food orders past server deadline — cancelled by backend cron (app/site may be closed). */

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

/**
 * Expired only when Current Time >= snapshotted acceptance deadline.
 * Prefer order-level deadline / window (frozen at place). Live Super Admin
 * minutes are last-resort for legacy rows missing both snapshot fields.
 * Never cancels before the order's configured deadline.
 */
const EXPIRED_ACCEPTANCE_PREDICATE = `
  (
    f.merchant_acceptance_deadline_at IS NOT NULL
    AND f.merchant_acceptance_deadline_at <= NOW()
  )
  OR (
    f.merchant_acceptance_deadline_at IS NULL
    AND f.merchant_acceptance_window_seconds IS NOT NULL
    AND f.merchant_acceptance_window_seconds > 0
    AND (f.created_at + make_interval(secs => f.merchant_acceptance_window_seconds::double precision)) <= NOW()
  )
  OR (
    f.merchant_acceptance_deadline_at IS NULL
    AND (f.merchant_acceptance_window_seconds IS NULL OR f.merchant_acceptance_window_seconds <= 0)
    AND (f.created_at + make_interval(mins => COALESCE(cfg.win_m, 5))) <= NOW()
  )
`;

const UNACCEPTED_FOOD_WHERE = `
  upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
  AND f.cancelled_at IS NULL
  AND f.accepted_at IS NULL
`;

/**
 * Cancel expired unaccepted food rows.
 *
 * Important: do NOT UPDATE orders_core in the same SQL statement as orders_food.
 * `handle_orders_food_cancellation` (BEFORE UPDATE on orders_food) already writes
 * orders_core; a second core UPDATE in the same command raises Postgres 27000
 * ("tuple to be updated was already modified by an operation triggered by the current command").
 */
async function fetchExpiredAcceptanceTargets(
  sql: Sql,
  options: { merchantStoreId?: number; limit?: number } = {}
): Promise<CancelledRow[]> {
  const limit = Math.max(1, Math.min(500, options.limit ?? 200));
  const storeId = options.merchantStoreId;

  const rows =
    storeId != null && Number.isFinite(storeId) && storeId > 0
      ? ((await sql.unsafe(
          `
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
          AND ${UNACCEPTED_FOOD_WHERE}
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
          cancelled_by_label = $4,
          cancelled_by_type = 'system',
          cancellation_details = jsonb_build_object(
            'version', 1,
            'source', 'system',
            'action_source', 'system',
            'cancel_mode', 'auto',
            'reason_code', $3::text,
            'rejected_reason', $3::text,
            'cancelled_by_label', $4::text
          ),
          merchant_acceptance_timeout_processed_at = NOW(),
          updated_at = NOW()
        FROM targets t
        WHERE f.id = t.food_id
          AND ${UNACCEPTED_FOOD_WHERE}
        RETURNING f.order_id AS core_id, f.id AS food_id, f.merchant_store_id
      )
      SELECT f.core_id, f.food_id, f.merchant_store_id, c.grand_total
      FROM upd_food f
      JOIN orders_core c ON c.id = f.core_id
    `,
          [storeId, limit, MERCHANT_ACCEPT_TIMEOUT_REASON, MERCHANT_ACCEPT_TIMEOUT_LABEL]
        )) as CancelledRow[])
      : ((await sql.unsafe(
          `
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
      WHERE ${UNACCEPTED_FOOD_WHERE}
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
        cancelled_by_label = $3,
        cancelled_by_type = 'system',
        cancellation_details = jsonb_build_object(
          'version', 1,
          'source', 'system',
          'action_source', 'system',
          'cancel_mode', 'auto',
          'reason_code', $2::text,
          'rejected_reason', $2::text,
          'cancelled_by_label', $3::text
        ),
        merchant_acceptance_timeout_processed_at = NOW(),
        updated_at = NOW()
      FROM targets t
      WHERE f.id = t.food_id
        AND ${UNACCEPTED_FOOD_WHERE}
      RETURNING f.order_id AS core_id, f.id AS food_id, f.merchant_store_id
    )
    SELECT f.core_id, f.food_id, f.merchant_store_id, c.grand_total
    FROM upd_food f
    JOIN orders_core c ON c.id = f.core_id
  `,
          [limit, MERCHANT_ACCEPT_TIMEOUT_REASON, MERCHANT_ACCEPT_TIMEOUT_LABEL]
        )) as CancelledRow[]);

  // Separate statement: fill SYSTEM actor if the BEFORE trigger left cancelled_by empty.
  const coreIds = rows
    .map((r) => Number(r.core_id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (coreIds.length > 0) {
    await sql`
      UPDATE orders_core
      SET
        status = 'cancelled',
        current_status = 'CANCELLED',
        cancelled_at = COALESCE(cancelled_at, NOW()),
        cancelled_by = COALESCE(NULLIF(BTRIM(cancelled_by), ''), 'SYSTEM'),
        updated_at = NOW()
      WHERE id = ANY(${coreIds})
    `;
  }

  return rows;
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
      rejectedReason: MERCHANT_ACCEPT_TIMEOUT_REASON,
      actorType: "system",
      cancelMode: "auto",
      statusMessage: MERCHANT_ACCEPT_TIMEOUT_LABEL,
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
      displayReason: MERCHANT_ACCEPT_TIMEOUT_REASON,
      reasonCode: MERCHANT_ACCEPT_TIMEOUT_REASON,
      cancelledByType: "system",
      cancelledByLabel: MERCHANT_ACCEPT_TIMEOUT_LABEL,
      actionSource: "system",
      cancelMode: "auto",
      previousStatus: "CREATED",
      grandTotal: row.grand_total,
      refundStatus: refund.refundStatus,
      refundAmount: refund.refundAmount,
      metadata: {
        reason_code: MERCHANT_ACCEPT_TIMEOUT_REASON,
        rejected_reason: MERCHANT_ACCEPT_TIMEOUT_REASON,
        ...(engineResult.raw ? { financial_rule_engine: engineResult.raw } : {}),
      },
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
    // Auto-refund the customer 100% — merchant never accepted, so anything they
    // paid must go back automatically. Best-effort: a refund failure leaves a
    // retriable order_refunds row and must not abort the cancellation.
    try {
      const outcome = await autoRefundOnCancellation(
        {
          orderCoreId: coreId,
          reason: `${MERCHANT_ACCEPT_TIMEOUT_LABEL} — ${MERCHANT_ACCEPT_TIMEOUT_REASON}`,
          actorEmail: null,
          actorRole: "system",
        },
        sql
      );
      log.info(
        { coreId, triggered: outcome.triggered, skipped: outcome.skippedReason, status: outcome.result?.status },
        "order_acceptance_timeout_auto_refund"
      );
    } catch (refundErr) {
      log.error({ err: refundErr, coreId }, "order_acceptance_timeout_auto_refund_failed");
    }
    try {
      const ownerRows = (await sql`
        SELECT
          oc.order_id,
          oc.formatted_order_id,
          c.customer_id AS customer_user_id,
          s.user_id AS merchant_user_id,
          s.store_display_name AS store_name
        FROM orders_core oc
        LEFT JOIN customers c ON c.id = oc.customer_id
        LEFT JOIN merchant_stores s ON s.id = ${storeId}
        WHERE oc.id = ${coreId}
        LIMIT 1
      `) as Array<{
        order_id: string | null;
        formatted_order_id: string | null;
        customer_user_id: string | null;
        merchant_user_id: string | null;
        store_name: string | null;
      }>;
      const owner = ownerRows[0];
      const orderIdText = String(owner?.order_id ?? coreId);
      const displayId = owner?.formatted_order_id ?? orderIdText;
      try {
        await clearMerchantStoreOrderNotifications(sql, {
          merchantStoreId: storeId,
          ordersFoodId: foodId,
          orderCoreId: coreId,
          formattedOrderId: displayId,
        });
      } catch {
        /* inbox clear is best-effort */
      }
      emitEvent("order.status_changed", {
        orderId: orderIdText,
        orderShortId: displayId,
        fromStatus: "CREATED",
        toStatus: "CANCELLED",
        customerId: owner?.customer_user_id ?? null,
        merchantUserId: owner?.merchant_user_id ?? null,
        merchantStoreId: storeId,
        merchantName: owner?.store_name ?? null,
        reason: MERCHANT_ACCEPT_TIMEOUT_REASON,
        // Accept-timeout always auto-refunds what the customer paid.
        refundEligible: true,
        refundStatus:
          refund.refundStatus === "no_refund" ? "pending" : refund.refundStatus,
        refundAmount:
          refund.refundAmount != null && Number(refund.refundAmount) > 0.005
            ? Number(refund.refundAmount)
            : Number(row.grand_total ?? 0) || null,
      });
    } catch {
      /* notification fan-out is best-effort */
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
 * Repair auto-cancelled orders that never got an order_refunds row
 * (e.g. dashboard sync cancelled but HTTP auto-refund hop failed).
 * Orders that already have a refund row (including FAILED) are left for the
 * existing execute endpoint — they must not be re-selected every tick.
 */
async function repairUnrefundedAcceptTimeoutCancels(
  sql: Sql,
  log: TimeoutLog,
  opts?: { merchantStoreId?: number; limit?: number }
): Promise<number> {
  const limit = Math.max(1, Math.min(100, opts?.limit ?? 40));
  const storeId = opts?.merchantStoreId;
  const storeFilter =
    storeId != null && Number.isFinite(storeId) && storeId > 0
      ? sql`AND f.merchant_store_id = ${storeId}`
      : sql``;

  const rows = (await sql`
    SELECT DISTINCT c.id AS core_id
    FROM orders_food f
    JOIN orders_core c ON c.id = f.order_id
    WHERE upper(COALESCE(f.order_status, '')) = 'CANCELLED'
      AND f.cancelled_at IS NOT NULL
      AND f.cancelled_at > NOW() - INTERVAL '30 days'
      AND (
        upper(COALESCE(f.rejected_reason, '')) = ${MERCHANT_ACCEPT_TIMEOUT_REASON}
        OR upper(COALESCE(f.cancelled_by_label, '')) = ${MERCHANT_ACCEPT_TIMEOUT_LABEL.toUpperCase()}
        OR upper(COALESCE(f.cancellation_details->>'reason_code', '')) = ${MERCHANT_ACCEPT_TIMEOUT_REASON}
      )
      ${storeFilter}
      AND NOT EXISTS (
        SELECT 1
        FROM order_refunds r
        WHERE r.order_id = c.id
      )
    ORDER BY c.id DESC
    LIMIT ${limit}
  `) as Array<{ core_id: number }>;

  let repaired = 0;
  for (const row of rows) {
    const coreId = Number(row.core_id);
    if (!Number.isFinite(coreId) || coreId <= 0) continue;
    try {
      const outcome = await autoRefundOnCancellation(
        {
          orderCoreId: coreId,
          reason: `${MERCHANT_ACCEPT_TIMEOUT_LABEL} — ${MERCHANT_ACCEPT_TIMEOUT_REASON}`,
          actorEmail: null,
          actorRole: "system",
        },
        sql
      );
      if (outcome.triggered) {
        repaired += 1;
        log.info(
          { coreId, status: outcome.result?.status, skipped: outcome.skippedReason },
          "order_acceptance_timeout_auto_refund_repair"
        );
      }
    } catch (err) {
      log.error({ err, coreId }, "order_acceptance_timeout_auto_refund_repair_failed");
    }
  }
  return repaired;
}

/** Repair is for missed HTTP auto-refund hops, not a 10s retry of FAILED rows. */
const REPAIR_EVERY_MS = 5 * 60 * 1000;
let lastRepairAtMs = 0;

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

      let repaired = 0;
      const nowMs = Date.now();
      if (nowMs - lastRepairAtMs >= REPAIR_EVERY_MS) {
        repaired = await repairUnrefundedAcceptTimeoutCancels(sql, log, { limit: 40 });
        lastRepairAtMs = nowMs;
      }

      const cancelled = cancelledRows.length;
      if (cancelled > 0 || autoAccepted > 0 || repaired > 0) {
        log.info({ cancelled, autoAccepted, repaired, now }, "order_acceptance_timeout_tick");
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
      log.info(
        { cancelled, autoAccepted, merchantStoreId, now },
        "order_acceptance_timeout_store_sync"
      );
    }
    return { cancelled, auto_accepted: autoAccepted };
  } catch (e) {
    log.error({ err: e, merchantStoreId, now }, "order_acceptance_timeout_store_sync_failed");
    return { cancelled: 0, auto_accepted: 0 };
  }
}
