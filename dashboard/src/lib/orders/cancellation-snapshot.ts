/**
 * Cancellation snapshot / restore — the compensating-undo half of the atomic
 * "cancel + refund" flow.
 *
 * A gateway refund is irreversible, so the only way to make cancel+refund
 * all-or-nothing is to make the CANCELLATION undoable and run it before the
 * money moves:
 *
 *   snapshot → cancel (committed) → execute refund
 *     accepted → keep the cancellation
 *     rejected → restore(snapshot) so the order looks untouched
 *
 * What we capture is everything the cancellation path writes on orders_core /
 * orders_food, plus the high-water-mark ids of the two append-only tables it
 * inserts into (order_cancellation_reasons, order_timelines) so the rows it
 * added can be removed precisely without tracking individual ids.
 */

import { getSql } from "../db/client";

export interface CancellationSnapshot {
  orderId: number;
  found: boolean;
  core: {
    status: string | null;
    currentStatus: string | null;
    cancelledAt: string | null;
    cancelledBy: string | null;
    cancelledById: number | null;
    cancellationReasonId: number | null;
    cancelledByType: string | null;
    cancellationDetails: unknown;
  };
  food: {
    orderStatus: string | null;
    cancelledAt: string | null;
    rejectedReason: string | null;
    cancelledByLabel: string | null;
    cancelledByType: string | null;
    cancellationReasonId: number | null;
  } | null;
  /** Rows with id greater than these were created by the attempt we may undo. */
  maxCancellationReasonId: number;
  maxTimelineId: number;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Capture the order's pre-cancellation state. Call BEFORE any cancellation write. */
export async function captureCancellationSnapshot(
  orderId: number
): Promise<CancellationSnapshot> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      c.status::text              AS status,
      c.current_status::text      AS current_status,
      c.cancelled_at::text        AS cancelled_at,
      c.cancelled_by              AS cancelled_by,
      c.cancelled_by_id           AS cancelled_by_id,
      c.cancellation_reason_id    AS cancellation_reason_id,
      c.cancelled_by_type::text   AS cancelled_by_type,
      c.cancellation_details      AS cancellation_details,
      f.order_status::text        AS food_order_status,
      f.cancelled_at::text        AS food_cancelled_at,
      f.rejected_reason           AS food_rejected_reason,
      f.cancelled_by_label        AS food_cancelled_by_label,
      f.cancelled_by_type::text   AS food_cancelled_by_type,
      f.cancellation_reason_id    AS food_cancellation_reason_id,
      (f.id IS NOT NULL)          AS has_food,
      COALESCE((SELECT MAX(id) FROM order_cancellation_reasons WHERE order_id = c.id), 0) AS max_reason_id,
      COALESCE((SELECT MAX(id) FROM order_timelines WHERE order_id = c.id), 0)            AS max_timeline_id
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ${orderId}
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) {
    return {
      orderId,
      found: false,
      core: {
        status: null,
        currentStatus: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelledById: null,
        cancellationReasonId: null,
        cancelledByType: null,
        cancellationDetails: null,
      },
      food: null,
      maxCancellationReasonId: 0,
      maxTimelineId: 0,
    };
  }

  return {
    orderId,
    found: true,
    core: {
      status: (r.status as string) ?? null,
      currentStatus: (r.current_status as string) ?? null,
      cancelledAt: (r.cancelled_at as string) ?? null,
      cancelledBy: (r.cancelled_by as string) ?? null,
      cancelledById: toNumOrNull(r.cancelled_by_id),
      cancellationReasonId: toNumOrNull(r.cancellation_reason_id),
      cancelledByType: (r.cancelled_by_type as string) ?? null,
      cancellationDetails: r.cancellation_details ?? null,
    },
    food: r.has_food
      ? {
          orderStatus: (r.food_order_status as string) ?? null,
          cancelledAt: (r.food_cancelled_at as string) ?? null,
          rejectedReason: (r.food_rejected_reason as string) ?? null,
          cancelledByLabel: (r.food_cancelled_by_label as string) ?? null,
          cancelledByType: (r.food_cancelled_by_type as string) ?? null,
          cancellationReasonId: toNumOrNull(r.food_cancellation_reason_id),
        }
      : null,
    maxCancellationReasonId: Number(r.max_reason_id ?? 0),
    maxTimelineId: Number(r.max_timeline_id ?? 0),
  };
}

/**
 * Undo a cancellation, returning the order to its snapshotted state and
 * deleting the rows the attempt appended. Runs in one transaction so the order
 * never sits half-restored. Safe to call when nothing was written.
 */
export async function restoreCancellationSnapshot(
  snapshot: CancellationSnapshot,
  opts: { markRefundFailedId?: number | null; failureReason?: string } = {}
): Promise<{ restored: boolean }> {
  if (!snapshot.found) return { restored: false };
  const sql = getSql();
  const { orderId, core, food } = snapshot;

  await sql.begin(async (tx) => {
    await tx`
      UPDATE orders_core
      SET status                 = ${core.status}::order_status_type,
          current_status         = ${core.currentStatus},
          cancelled_at           = ${core.cancelledAt}::timestamptz,
          cancelled_by           = ${core.cancelledBy},
          cancelled_by_id        = ${core.cancelledById},
          cancellation_reason_id = ${core.cancellationReasonId},
          cancelled_by_type      = ${core.cancelledByType},
          cancellation_details   = ${
            core.cancellationDetails === null
              ? null
              : JSON.stringify(core.cancellationDetails)
          }::jsonb,
          updated_at             = NOW()
      WHERE id = ${orderId}
    `;

    if (food) {
      await tx`
        UPDATE orders_food
        SET order_status           = ${food.orderStatus},
            cancelled_at           = ${food.cancelledAt}::timestamptz,
            rejected_reason        = ${food.rejectedReason},
            cancelled_by_label     = ${food.cancelledByLabel},
            cancelled_by_type      = ${food.cancelledByType},
            cancellation_reason_id = ${food.cancellationReasonId},
            updated_at             = NOW()
        WHERE order_id = ${orderId}
      `;
    }

    // Remove the append-only rows this attempt created.
    await tx`
      DELETE FROM order_timelines
      WHERE order_id = ${orderId} AND id > ${snapshot.maxTimelineId}
    `;
    await tx`
      DELETE FROM order_cancellation_reasons
      WHERE order_id = ${orderId} AND id > ${snapshot.maxCancellationReasonId}
    `;

    // Keep the refund row as an auditable FAILED record rather than deleting it,
    // so the attempt is still traceable and the guard won't count it as active.
    if (opts.markRefundFailedId) {
      await tx`
        UPDATE order_refunds
        SET refund_status    = 'failed',
            execution_status = 'FAILED',
            failed_at        = NOW(),
            failure_reason   = ${opts.failureReason ?? "refund_rejected_cancellation_rolled_back"}
        WHERE id = ${opts.markRefundFailedId}
      `;
    }
  });

  return { restored: true };
}
