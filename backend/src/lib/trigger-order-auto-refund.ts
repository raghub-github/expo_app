/**
 * Shared auto-refund hop for merchant / store / system cancellations.
 *
 * Partner Site calls this via HTTP `/v1/internal/orders/:id/auto-refund` or
 * in-process import. Merchant App cancel hits the same helper from
 * `patchMerchantFoodOrderStatus` after orders_core is synced — matching Partner
 * Site ordering (cancel row written → core status CANCELLED → move money).
 */

import type { Sql } from "postgres";
import { getSql } from "../db/client.js";
import {
  autoRefundOnCancellation,
  shouldAutoRefundForCancellationActor,
  type AutoRefundOutcome,
} from "./auto-refund-on-cancellation.js";
import { syncOrderRefundCompletionMarkers } from "./order-refund-completion-sync.js";

export type TriggerOrderAutoRefundArgs = {
  /** orders_core primary key. */
  orderCoreId: number;
  reason: string;
  /** store | merchant | system | rider | admin | agent */
  actorRole: string;
  actorEmail?: string | null;
  /** Omit for full refund of what the customer paid. */
  amount?: number | null;
  /** Used for order_cancellation refund_status sync when execution completes. */
  orderGrandTotal?: number | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Move customer money after a non-customer cancel. Idempotent + best-effort.
 */
export async function triggerOrderAutoRefundAfterCancel(
  args: TriggerOrderAutoRefundArgs,
  sql: Sql = getSql()
): Promise<AutoRefundOutcome> {
  const orderCorePk = Number(args.orderCoreId);
  if (!Number.isInteger(orderCorePk) || orderCorePk < 1) {
    return { triggered: false, skippedReason: "order_not_found" };
  }

  const role = String(args.actorRole ?? "").trim().toLowerCase();
  if (!shouldAutoRefundForCancellationActor(role)) {
    return { triggered: false, skippedReason: "customer_cancellation" };
  }

  const outcome = await autoRefundOnCancellation(
    {
      orderCoreId: orderCorePk,
      reason: String(args.reason ?? "").trim() || "Order cancelled",
      actorEmail: args.actorEmail ?? null,
      actorRole: role,
      amount:
        args.amount != null && Number.isFinite(Number(args.amount)) && Number(args.amount) > 0
          ? Number(args.amount)
          : null,
    },
    sql
  );

  if (outcome.triggered && outcome.refundId != null) {
    const execStatus = String(outcome.result?.status ?? "").toUpperCase();
    const kind =
      execStatus === "COMPLETED" || execStatus === "NOOP"
        ? ("completed" as const)
        : execStatus === "FAILED"
          ? ("failed" as const)
          : ("processing" as const);
    try {
      await syncOrderRefundCompletionMarkers(
        {
          orderCoreId: orderCorePk,
          refundId: outcome.refundId,
          kind,
          refundAmount: num(args.orderGrandTotal) > 0 ? num(args.orderGrandTotal) : null,
        },
        sql
      );
    } catch {
      /* non-fatal — refund row + executor outcome are authoritative */
    }
  }

  console.info(
    "[trigger-order-auto-refund]",
    JSON.stringify({
      orderCoreId: orderCorePk,
      actorRole: role,
      triggered: outcome.triggered,
      skipped: outcome.skippedReason ?? null,
      refundId: outcome.refundId ?? null,
      status: outcome.result?.status ?? null,
    })
  );

  return outcome;
}

/** Map executor outcome → order_cancellation refund_status label. */
export function refundStatusFromAutoRefundOutcome(
  outcome: AutoRefundOutcome,
  fallback: string | null = "pending"
): string | null {
  if (outcome.triggered && outcome.refundId != null) {
    const execStatus = String(outcome.result?.status ?? "").toUpperCase();
    if (execStatus === "COMPLETED" || execStatus === "NOOP") return "completed";
    if (execStatus === "FAILED") return "failed";
    return "pending";
  }
  if (outcome.skippedReason === "already_refunded") return "completed";
  return fallback;
}

/**
 * Fire-and-forget money movement after a customer-visible refund promise.
 * Does not block cancel HTTP. Executor splits GatiCash vs UPI/card.
 */
export function queueCustomerShownRefundAfterCancel(args: {
  orderCoreId: number;
  reason: string;
  amount: number;
  actorRole?: string | null;
}): void {
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0.005) return;
  const orderCoreId = Number(args.orderCoreId);
  if (!Number.isInteger(orderCoreId) || orderCoreId < 1) return;
  const actorRole = String(args.actorRole ?? "customer").trim() || "customer";
  const sql = getSql();

  void (async () => {
    try {
      const outcome = await autoRefundOnCancellation(
        {
          orderCoreId,
          reason: String(args.reason ?? "").trim() || "Cancelled by customer",
          actorRole,
          amount,
          allowCustomerPreAcceptRefund: true,
        },
        sql
      );
      if (outcome.triggered && outcome.refundId != null) {
        const execStatus = String(outcome.result?.status ?? "").toUpperCase();
        const kind =
          execStatus === "COMPLETED" || execStatus === "NOOP"
            ? ("completed" as const)
            : execStatus === "FAILED"
              ? ("failed" as const)
              : ("processing" as const);
        await syncOrderRefundCompletionMarkers(
          {
            orderCoreId,
            refundId: outcome.refundId,
            kind,
            refundAmount: amount,
          },
          sql
        );
      }
      console.info(
        "[queue-customer-shown-refund]",
        JSON.stringify({
          orderCoreId,
          amount,
          actorRole,
          triggered: outcome.triggered,
          skipped: outcome.skippedReason ?? null,
          refundId: outcome.refundId ?? null,
          status: outcome.result?.status ?? null,
        })
      );
    } catch (refundErr) {
      console.warn(
        "[queue-customer-shown-refund] failed (order stays cancelled; refund retryable):",
        refundErr
      );
      try {
        await sql`
          UPDATE order_cancellation_reasons
          SET refund_status = 'failed',
              refund_amount = COALESCE(${amount}, refund_amount),
              updated_at = NOW()
          WHERE order_id = ${orderCoreId}
            AND id = (
              SELECT id FROM order_cancellation_reasons
              WHERE order_id = ${orderCoreId}
              ORDER BY created_at DESC
              LIMIT 1
            )
        `;
      } catch {
        /* schema may lack columns */
      }
    }
  })();
}
