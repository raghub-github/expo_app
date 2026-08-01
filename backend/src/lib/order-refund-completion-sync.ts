/**
 * Keep cancellation + order payment status in sync with order_refunds execution.
 *
 * Customer history "Refunded" badge reads order_cancellation_reasons.refund_status
 * (and sometimes orders_core.payment_status). The refund executor historically only
 * updated order_refunds — leaving cancellation rows at refund_status='pending'.
 */

import type { Sql } from "postgres";
import { getSql } from "../db/client.js";

export type OrderRefundCompletionKind = "completed" | "processing" | "failed";

/**
 * Mirror refund execution onto cancellation + orders_core so list/detail UIs
 * show Refunded without a manual refresh of unrelated tables.
 */
export async function syncOrderRefundCompletionMarkers(
  args: {
    orderCoreId: number;
    refundId: number;
    kind: OrderRefundCompletionKind;
    refundAmount?: number | null;
  },
  sql: Sql = getSql()
): Promise<void> {
  const orderCoreId = Number(args.orderCoreId);
  const refundId = Number(args.refundId);
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) return;
  if (!Number.isFinite(refundId) || refundId <= 0) return;

  const cancellationStatus =
    args.kind === "completed"
      ? "completed"
      : args.kind === "processing"
        ? "processing"
        : "failed";
  const paymentStatus =
    args.kind === "completed"
      ? "refunded"
      : args.kind === "processing"
        ? "refund_pending"
        : null;

  try {
    await sql`
      UPDATE order_cancellation_reasons
      SET refund_status = ${cancellationStatus},
          refund_amount = COALESCE(
            ${args.refundAmount != null ? args.refundAmount : null},
            refund_amount
          ),
          updated_at = NOW()
      WHERE order_id = ${orderCoreId}
        AND id = (
          SELECT id
          FROM order_cancellation_reasons
          WHERE order_id = ${orderCoreId}
          ORDER BY created_at DESC
          LIMIT 1
        )
    `;
  } catch {
    /* older schemas may lack updated_at */
    try {
      await sql`
        UPDATE order_cancellation_reasons
        SET refund_status = ${cancellationStatus},
            refund_amount = COALESCE(
              ${args.refundAmount != null ? args.refundAmount : null},
              refund_amount
            )
        WHERE order_id = ${orderCoreId}
          AND id = (
            SELECT id
            FROM order_cancellation_reasons
            WHERE order_id = ${orderCoreId}
            ORDER BY created_at DESC
            LIMIT 1
          )
      `;
    } catch {
      /* table / columns may be absent */
    }
  }

  if (paymentStatus) {
    try {
      await sql`
        UPDATE orders_core
        SET payment_status = ${paymentStatus},
            updated_at = NOW()
        WHERE id = ${orderCoreId}
      `;
    } catch {
      try {
        await sql`
          UPDATE orders_core
          SET payment_status = ${paymentStatus}
          WHERE id = ${orderCoreId}
        `;
      } catch {
        /* payment_status column may not exist on very old DBs */
      }
    }
  }

  // Keep orders_core.total_refunded in sync with settled refunds (dashboard / reports).
  if (args.kind === "completed" || args.kind === "processing") {
    try {
      await sql`
        UPDATE orders_core c
        SET total_refunded = COALESCE((
              SELECT ROUND(SUM(COALESCE(r.refund_amount, 0))::numeric, 2)
              FROM order_refunds r
              WHERE r.order_id = c.id
                AND LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
                AND (
                  r.customer_wallet_ledger_id IS NOT NULL
                  OR NULLIF(TRIM(COALESCE(r.razorpay_refund_id, '')), '') IS NOT NULL
                  OR UPPER(COALESCE(r.execution_status, '')) IN ('COMPLETED', 'PROCESSING', 'NOOP')
                )
            ), 0),
            updated_at = NOW()
        WHERE c.id = ${orderCoreId}
      `;
    } catch {
      try {
        await sql`
          UPDATE orders_core c
          SET total_refunded = COALESCE((
                SELECT ROUND(SUM(COALESCE(r.refund_amount, 0))::numeric, 2)
                FROM order_refunds r
                WHERE r.order_id = c.id
                  AND LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
                  AND (
                    r.customer_wallet_ledger_id IS NOT NULL
                    OR NULLIF(TRIM(COALESCE(r.razorpay_refund_id, '')), '') IS NOT NULL
                    OR UPPER(COALESCE(r.execution_status, '')) IN ('COMPLETED', 'PROCESSING', 'NOOP')
                  )
              ), 0)
          WHERE c.id = ${orderCoreId}
        `;
      } catch {
        /* total_refunded may be absent */
      }
    }
  }

  // Keep / mint a unique customer RRN (RRN-{UUID}). Gateway rfnd_* stays on
  // razorpay_refund_id / pg_refund_id — never overwrite a modern RRN.
  try {
    await sql`
      UPDATE order_refunds
      SET
        refund_reference = CASE
          WHEN NULLIF(TRIM(refund_reference), '') IS NOT NULL
            AND TRIM(refund_reference) ~* '^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
            THEN TRIM(refund_reference)
          ELSE 'RRN-' || UPPER(gen_random_uuid()::text)
        END,
        pg_refund_id = COALESCE(
          NULLIF(TRIM(razorpay_refund_id), ''),
          CASE
            WHEN NULLIF(TRIM(pg_refund_id), '') IS NOT NULL
              AND TRIM(pg_refund_id) ~* '^rfnd_'
              THEN NULLIF(TRIM(pg_refund_id), '')
            ELSE NULL
          END,
          NULLIF(TRIM(pg_refund_id), '')
        ),
        initiated_at = COALESCE(initiated_at, NOW())
      WHERE id = ${refundId}
    `;
  } catch {
    try {
      await sql`
        UPDATE order_refunds
        SET
          refund_reference = CASE
            WHEN NULLIF(TRIM(refund_reference), '') IS NOT NULL
              AND TRIM(refund_reference) ~* '^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
              THEN TRIM(refund_reference)
            ELSE 'RRN-' || UPPER(gen_random_uuid()::text)
          END,
          pg_refund_id = COALESCE(
            NULLIF(TRIM(razorpay_refund_id), ''),
            NULLIF(TRIM(pg_refund_id), '')
          ),
          initiated_at = COALESCE(initiated_at, NOW())
        WHERE id = ${refundId}
      `;
    } catch {
      try {
        await sql`
          UPDATE order_refunds
          SET pg_refund_id = COALESCE(
                NULLIF(TRIM(pg_refund_id), ''),
                NULLIF(TRIM(razorpay_refund_id), '')
              )
          WHERE id = ${refundId}
            AND (
              pg_refund_id IS NULL
              OR TRIM(COALESCE(pg_refund_id, '')) = ''
              OR TRIM(COALESCE(pg_refund_id, '')) ~* '^RFND-\\d+$'
            )
        `;
      } catch {
        /* columns may be absent */
      }
    }
  }
}
