import type postgres from "postgres";
import { getSql } from "@/lib/db/client";
import {
  executeOrderCancellationFinancials,
  lookupOrderContext,
} from "@/lib/financial-rule-executor";
import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";
import { appendCancellationTimeline } from "@/lib/orderCancellationTimeline";
import { recordOrderCancellation } from "@/lib/record-order-cancellation";
import { triggerOrderAutoRefund } from "@/lib/triggerOrderAutoRefund";
import { supabaseAdmin } from "@/lib/supabase/server";

const AUTO_CANCEL_REASON = "MERCHANT_ACCEPT_TIMEOUT";
const AUTO_CANCEL_LABEL = "Auto Cancelled";
const AUTO_CANCEL_REFUND_REASON = `${AUTO_CANCEL_LABEL} — ${AUTO_CANCEL_REASON}`;

type Sql = ReturnType<typeof postgres>;
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

async function fetchExpiredAcceptanceTargets(
  sql: Sql,
  merchantStoreId: number,
  limit = 200
): Promise<CancelledRow[]> {
  // Do not UPDATE orders_core in the same statement as orders_food — the food
  // cancellation BEFORE trigger already writes core (Postgres 27000 otherwise).
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
      WHERE f.merchant_store_id = ${merchantStoreId}
        AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
        AND f.cancelled_at IS NULL
        AND f.accepted_at IS NULL
        AND (
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
        )
      ORDER BY f.created_at ASC
      LIMIT ${limit}
    ),
    upd_food AS (
      UPDATE orders_food f
      SET
        order_status = 'CANCELLED',
        cancelled_at = NOW(),
        rejected_reason = ${AUTO_CANCEL_REASON},
        cancelled_by_label = ${AUTO_CANCEL_LABEL},
        cancelled_by_type = 'system',
        cancellation_details = jsonb_build_object(
          'version', 1,
          'source', 'system',
          'action_source', 'system',
          'cancel_mode', 'auto',
          'reason_code', ${AUTO_CANCEL_REASON}::text,
          'rejected_reason', ${AUTO_CANCEL_REASON}::text,
          'cancelled_by_label', ${AUTO_CANCEL_LABEL}::text
        ),
        merchant_acceptance_timeout_processed_at = NOW(),
        updated_at = NOW()
      FROM targets t
      WHERE f.id = t.food_id
        AND upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
        AND f.cancelled_at IS NULL
      RETURNING f.order_id AS core_id, f.id AS food_id, f.merchant_store_id
    )
    SELECT f.core_id, f.food_id, f.merchant_store_id, c.grand_total
    FROM upd_food f
    JOIN orders_core c ON c.id = f.core_id
  `) as CancelledRow[];

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

async function finalizeCancelledRows(
  sql: Sql,
  cancelledRows: CancelledRow[],
  log: TimeoutLog
): Promise<void> {
  for (const row of cancelledRows) {
    const coreId = Number(row?.core_id);
    const foodId = Number(row?.food_id);
    const storeId = Number(row?.merchant_store_id);
    if (!Number.isFinite(coreId) || coreId <= 0) continue;
    try {
      await appendCancellationTimeline({
        orderCorePk: coreId,
        previousStatus: "CREATED",
        rejectedReason: AUTO_CANCEL_REASON,
        actorType: "system",
        cancelMode: "auto",
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
      if (supabaseAdmin) {
        await recordOrderCancellation(supabaseAdmin, {
          orderCorePk: coreId,
          cancelledBy: "SYSTEM",
          displayReason: AUTO_CANCEL_REASON,
          reasonCode: AUTO_CANCEL_REASON,
          cancelledByType: "system",
          cancelledByLabel: AUTO_CANCEL_LABEL,
          actionSource: "system",
          cancelMode: "auto",
          previousStatus: "CREATED",
          grandTotal: row.grand_total,
          refundStatus: refund.refundStatus,
          refundAmount: refund.refundAmount,
          metadata: {
            reason_code: AUTO_CANCEL_REASON,
            rejected_reason: AUTO_CANCEL_REASON,
            ...(engineResult.raw ? { financial_rule_engine: engineResult.raw } : {}),
          },
        });
      }
      // Move money (GatiCash / Razorpay) — previously missing on dashboard sync path.
      await triggerOrderAutoRefund({
        orderCorePk: coreId,
        reason: AUTO_CANCEL_REFUND_REASON,
        actorRole: "system",
        amount:
          refund.refundAmount != null && Number(refund.refundAmount) > 0
            ? Number(refund.refundAmount)
            : null,
      });
    } catch (tlErr) {
      log.error({ err: tlErr, coreId }, "order_acceptance_timeout_timeline_failed");
    }
  }
}

export async function syncOrderAcceptanceTimeoutForStore(
  sql: Sql,
  merchantStoreId: number,
  log: TimeoutLog
): Promise<{ cancelled: number }> {
  try {
    const cancelledRows = await fetchExpiredAcceptanceTargets(sql, merchantStoreId, 200);
    await finalizeCancelledRows(sql, cancelledRows, log);
    return { cancelled: cancelledRows.length };
  } catch (e) {
    log.error({ err: e, merchantStoreId }, "order_acceptance_timeout_store_sync_failed");
    return { cancelled: 0 };
  }
}

export async function loadAcceptanceWindowMinutes(
  sql: Sql,
  storeInternalId: number
): Promise<number> {
  const storeRows = await sql`
    SELECT store_type::text AS store_type
    FROM merchant_stores
    WHERE id = ${storeInternalId}
    LIMIT 1
  `;
  const storeType = String(
    (storeRows[0] as { store_type?: string } | undefined)?.store_type ?? "GENERAL"
  ).toUpperCase();

  const loadPlatform = async (stype: string) => {
    const rows = await sql`
      SELECT acceptance_window_minutes
      FROM platform_food_acceptance_settings_by_store_type
      WHERE store_type = ${stype}
      LIMIT 1
    `;
    return (rows[0] as { acceptance_window_minutes?: number } | undefined) ?? undefined;
  };

  let row = await loadPlatform(storeType);
  if (!row) row = await loadPlatform("GENERAL");
  const windowRaw = Number(row?.acceptance_window_minutes ?? 5);
  return Number.isFinite(windowRaw)
    ? Math.max(1, Math.min(180, Math.floor(windowRaw)))
    : 5;
}

export function isWithinAcceptanceWindow(
  createdAtIso: string,
  acceptanceWindowMinutes: number,
  nowMs = Date.now()
): boolean {
  const mins = Math.max(1, Math.min(180, acceptanceWindowMinutes));
  const deadline = new Date(createdAtIso).getTime() + mins * 60_000;
  return nowMs < deadline;
}

/** Convenience wrapper using default SQL client. */
export async function syncOrderAcceptanceTimeoutForStoreId(
  merchantStoreId: number,
  log: TimeoutLog
): Promise<{ cancelled: number }> {
  return syncOrderAcceptanceTimeoutForStore(getSql(), merchantStoreId, log);
}
