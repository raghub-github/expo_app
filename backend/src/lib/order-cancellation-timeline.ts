import { sql } from "drizzle-orm";
import type { Sql } from "postgres";

export type CancellationTimelineInput = {
  orderCorePk: number;
  previousStatus?: string | null;
  rejectedReason?: string | null;
  actorType?: "system" | "store" | "customer" | "admin" | "agent";
  cancelMode?: "auto" | "manual";
  statusMessage?: string | null;
  occurredAt?: Date;
};

/**
 * Append a single "Cancelled" row to order_timelines (idempotent per order).
 * Used on merchant reject, auto-accept-timeout, and API cancellations.
 */
export async function recordCancellationTimeline(
  dbSql: Sql,
  input: CancellationTimelineInput
): Promise<void> {
  const reason = (input.rejectedReason ?? "").trim();
  const isAuto =
    input.cancelMode === "auto" ||
    /^auto cancelled/i.test(reason);
  const message =
    input.statusMessage?.trim() ||
    reason ||
    (isAuto ? "Auto Cancelled" : "Cancelled");
  const actorType = input.actorType ?? (isAuto ? "system" : "store");
  const metadata = {
    rejected_reason: reason || (isAuto ? "Auto Cancelled" : null),
    cancel_mode: input.cancelMode ?? (isAuto ? "auto" : "manual"),
    order_cancellation: true,
  };
  const occurredAt = input.occurredAt ?? new Date();

  await dbSql`
    INSERT INTO order_timelines (
      order_id,
      status,
      previous_status,
      actor_type,
      status_message,
      metadata,
      occurred_at
    )
    SELECT
      ${input.orderCorePk},
      'Cancelled',
      COALESCE(
        (
          SELECT ot.status
          FROM order_timelines ot
          WHERE ot.order_id = ${input.orderCorePk}
          ORDER BY ot.occurred_at DESC, ot.id DESC
          LIMIT 1
        ),
        ${input.previousStatus ?? null}
      ),
      ${actorType},
      ${message},
      ${JSON.stringify(metadata)}::text::jsonb,
      ${occurredAt.toISOString()}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1
      FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk}
        AND lower(trim(ot.status)) IN ('cancelled', 'canceled', 'rejected')
    )
  `;

  await dbSql`
    UPDATE orders_core
    SET current_status = 'Cancelled', updated_at = NOW()
    WHERE id = ${input.orderCorePk}
      AND upper(COALESCE(current_status, '')) NOT IN ('CANCELLED', 'DELIVERED', 'RTO')
  `;
}
