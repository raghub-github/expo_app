/**
 * Dispatch Engine — Phase 5b: auto-cancel + refund a food order that stayed unfilled
 * past the retry window (max_retry_duration_seconds), gated by
 * platform_rider_dispatch_strategy_config.auto_cancel_on_exhaustion.
 *
 * REUSES the existing cancellation engine (same flow as
 * services/order-acceptance-timeout.ts `finalizeCancelledRow`), so the money math is not
 * reimplemented:
 *   - full customer refund (system cancel, no customer fault) via autoRefundOnCancellation
 *   - merchant compensation via executeOrderCancellationFinancials +
 *     applyMerchantOrderCancellationLedger, driven by `previousStatus` = the food's actual
 *     prep stage: prepared (READY_FOR_PICKUP) -> partial merchant credit; not prepared ->
 *     nothing. The financial-rules config governs the exact amounts.
 *
 * Only acts on an unassigned, non-terminal FOOD order. Parcel/ride are not auto-cancelled
 * here (parcel has no prep stage; ride uses its own search-timeout/tip-boost + refund).
 */

import { getSql } from "../db/client.js";
import { executeOrderCancellationFinancials, lookupOrderContext } from "./financial-rule-executor.js";
import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";
import { recordCancellationTimeline } from "./order-cancellation-timeline.js";
import { recordOrderCancellation } from "./record-order-cancellation.js";
import { applyMerchantOrderCancellationLedger } from "./apply-merchant-cancellation-ledger.js";
import { autoRefundOnCancellation } from "./auto-refund-on-cancellation.js";
import { recordDispatchEvent } from "./dispatch-events.js";
import { emitEvent } from "../modules/notifications/eventBus.js";

const NO_RIDER_REASON = "NO_RIDER_AVAILABLE";
const NO_RIDER_LABEL = "No delivery partner available";

export type ExhaustedCancelResult = {
  cancelled: boolean;
  reason?: string;
};

/** Cancel + refund a food order unfilled past the retry window. Never throws. */
export async function cancelDispatchExhaustedOrder(
  orderCoreId: number
): Promise<ExhaustedCancelResult> {
  const sql = getSql();

  try {
    const rows = (await sql`
      SELECT
        oc.id AS core_id,
        oc.order_type,
        oc.status,
        oc.grand_total,
        oc.rider_id,
        f.id AS food_id,
        f.order_status AS food_status,
        f.merchant_store_id,
        f.cancelled_at AS food_cancelled_at
      FROM orders_core oc
      LEFT JOIN orders_food f ON f.order_id = oc.id
      WHERE oc.id = ${orderCoreId}
      LIMIT 1
    `) as Array<{
      core_id: number;
      order_type: string | null;
      status: string | null;
      grand_total: unknown;
      rider_id: number | null;
      food_id: number | null;
      food_status: string | null;
      merchant_store_id: number | null;
      food_cancelled_at: string | null;
    }>;

    const row = rows[0];
    if (!row) return { cancelled: false, reason: "not_found" };
    if (String(row.order_type ?? "") !== "food") return { cancelled: false, reason: "not_food" };
    if (row.rider_id != null) return { cancelled: false, reason: "already_assigned" };
    if (["delivered", "cancelled", "failed"].includes(String(row.status ?? ""))) {
      return { cancelled: false, reason: "terminal" };
    }
    if (row.food_cancelled_at != null) return { cancelled: false, reason: "already_cancelled" };

    const foodId = Number(row.food_id ?? 0) || 0;
    if (!foodId) return { cancelled: false, reason: "no_food_row" };
    const merchantStoreId = Number(row.merchant_store_id ?? 0) || 0;
    // Prep stage drives merchant compensation: READY_FOR_PICKUP => prepared.
    const previousStatus = String(row.food_status ?? "CREATED").trim().toUpperCase();

    // 1) Cancel the food row. The BEFORE-UPDATE trigger on orders_food writes orders_core,
    //    so orders_core is NOT updated in the same statement (Postgres 27000 guard).
    await sql`
      UPDATE orders_food
      SET
        order_status = 'CANCELLED',
        cancelled_at = NOW(),
        rejected_reason = ${NO_RIDER_REASON},
        cancelled_by_label = ${NO_RIDER_LABEL},
        cancelled_by_type = 'system',
        cancellation_details = jsonb_build_object(
          'version', 1,
          'source', 'system',
          'action_source', 'system',
          'cancel_mode', 'auto',
          'reason_code', ${NO_RIDER_REASON}::text,
          'rejected_reason', ${NO_RIDER_REASON}::text,
          'cancelled_by_label', ${NO_RIDER_LABEL}::text
        ),
        updated_at = NOW()
      WHERE id = ${foodId} AND cancelled_at IS NULL
    `;
    // Ensure orders_core reflects the cancellation (separate statement).
    await sql`
      UPDATE orders_core
      SET
        status = 'cancelled',
        current_status = 'CANCELLED',
        cancelled_at = COALESCE(cancelled_at, NOW()),
        cancelled_by = COALESCE(NULLIF(BTRIM(cancelled_by), ''), 'SYSTEM'),
        updated_at = NOW()
      WHERE id = ${orderCoreId} AND status NOT IN ('delivered', 'cancelled', 'failed')
    `;

    // 2) Financials + refund + merchant compensation — reuse the existing engine.
    await recordCancellationTimeline(sql, {
      orderCorePk: orderCoreId,
      previousStatus,
      rejectedReason: NO_RIDER_REASON,
      actorType: "system",
      cancelMode: "auto",
      statusMessage: NO_RIDER_LABEL,
    });

    const orderCtx = await lookupOrderContext(orderCoreId, sql);
    const engineResult = await executeOrderCancellationFinancials(
      {
        orderCoreId,
        ordersFoodId: foodId,
        coreOrderId: orderCtx.coreOrderId,
        merchantStoreId,
        previousStatus,
        cancelledByType: "system",
        orderGross: Number(row.grand_total ?? orderCtx.grandTotal),
        serviceType: orderCtx.serviceType,
      },
      sql
    );
    const refund = refundFieldsFromEngineResult(engineResult.raw);

    await recordOrderCancellation(sql, {
      orderCorePk: orderCoreId,
      cancelledBy: "SYSTEM",
      displayReason: NO_RIDER_REASON,
      reasonCode: NO_RIDER_REASON,
      cancelledByType: "system",
      cancelledByLabel: NO_RIDER_LABEL,
      actionSource: "system",
      cancelMode: "auto",
      previousStatus,
      grandTotal: row.grand_total,
      refundStatus: refund.refundStatus,
      refundAmount: refund.refundAmount,
      metadata: {
        reason_code: NO_RIDER_REASON,
        rejected_reason: NO_RIDER_REASON,
        ...(engineResult.raw ? { financial_rule_engine: engineResult.raw } : {}),
      },
    });

    // Merchant compensation — engine decides (prepared food => partial credit; else none).
    try {
      await applyMerchantOrderCancellationLedger(
        { orderCoreId, source: "system_auto_cancel" },
        sql
      );
    } catch (ledgerErr) {
      console.error(
        "[dispatch] exhausted merchant ledger failed",
        orderCoreId,
        (ledgerErr as Error).message
      );
    }

    // Customer refund — full (no rider found, not the customer's fault).
    try {
      await autoRefundOnCancellation(
        {
          orderCoreId,
          reason: `${NO_RIDER_LABEL} — ${NO_RIDER_REASON}`,
          actorEmail: null,
          actorRole: "system",
        },
        sql
      );
    } catch (refundErr) {
      console.error(
        "[dispatch] exhausted refund failed",
        orderCoreId,
        (refundErr as Error).message
      );
    }

    // 3) Notify customer + merchant in real time (best-effort).
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
        LEFT JOIN merchant_stores s ON s.id = ${merchantStoreId}
        WHERE oc.id = ${orderCoreId}
        LIMIT 1
      `) as Array<{
        order_id: string | null;
        formatted_order_id: string | null;
        customer_user_id: string | null;
        merchant_user_id: string | null;
        store_name: string | null;
      }>;
      const owner = ownerRows[0];
      const orderIdText = String(owner?.order_id ?? orderCoreId);
      const displayId = owner?.formatted_order_id ?? orderIdText;
      emitEvent("order.status_changed", {
        orderId: orderIdText,
        orderShortId: displayId,
        fromStatus: previousStatus,
        toStatus: "CANCELLED",
        customerId: owner?.customer_user_id ?? null,
        merchantUserId: owner?.merchant_user_id ?? null,
        merchantStoreId,
        merchantName: owner?.store_name ?? null,
        reason: NO_RIDER_REASON,
        refundEligible: true,
        refundStatus: refund.refundStatus === "no_refund" ? "pending" : refund.refundStatus,
        refundAmount:
          refund.refundAmount != null && Number(refund.refundAmount) > 0.005
            ? Number(refund.refundAmount)
            : Number(row.grand_total ?? 0) || null,
      });
    } catch {
      /* notification fan-out is best-effort */
    }

    // 4) Stop the dispatch session + audit.
    await sql`
      UPDATE order_dispatch_sessions
      SET status = 'expired', completed_at = NOW(), next_wave_at = NULL, updated_at = NOW()
      WHERE order_core_id = ${orderCoreId} AND status IN ('active', 'accepted')
    `;
    void recordDispatchEvent({
      orderCoreId,
      serviceType: "food",
      eventType: "refund_triggered",
      metadata: { reason: NO_RIDER_REASON, previousStatus, refundStatus: refund.refundStatus },
    });

    console.info(
      "[dispatch] exhausted_auto_cancel",
      JSON.stringify({ orderCoreId, previousStatus, refundStatus: refund.refundStatus })
    );
    return { cancelled: true };
  } catch (err) {
    console.error("[dispatch] exhausted_auto_cancel_failed", orderCoreId, (err as Error).message);
    return { cancelled: false, reason: "error" };
  }
}
