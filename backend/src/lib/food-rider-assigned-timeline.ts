import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** Merchant-visible timeline status when a rider accepts a food order. */
export const FOOD_RIDER_ASSIGNED_TIMELINE_STATUS = "Delivery Partner Assigned";

function toTimestamptzParam(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

export type FoodRiderAssignedTimelineInput = {
  orderCorePk: number;
  previousStatus?: string | null;
  riderId: number;
  riderName?: string | null;
  statusMessage?: string | null;
  occurredAt?: Date;
};

/**
 * Append a single rider-assigned row to order_timelines (idempotent per order).
 * Partnersite merchant timeline reads this via /api/food-orders/[id]/timeline.
 */
export async function recordFoodRiderAssignedTimeline(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: FoodRiderAssignedTimelineInput
): Promise<void> {
  const occurredAt = toTimestamptzParam(input.occurredAt ?? new Date());
  const riderName = input.riderName?.trim() || null;
  const message =
    input.statusMessage?.trim() ||
    (riderName
      ? `Delivery partner ${riderName} assigned`
      : "Delivery partner assigned");

  await tx.execute(sql`
    INSERT INTO order_timelines (
      order_id,
      status,
      previous_status,
      actor_type,
      actor_id,
      actor_name,
      status_message,
      metadata,
      occurred_at
    )
    SELECT
      ${input.orderCorePk},
      ${FOOD_RIDER_ASSIGNED_TIMELINE_STATUS},
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
      'rider',
      ${input.riderId},
      ${riderName},
      ${message},
      ${JSON.stringify({ rider_id: input.riderId, service_type: "food" })}::jsonb,
      ${occurredAt}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1
      FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk}
        AND (
          ot.status = ${FOOD_RIDER_ASSIGNED_TIMELINE_STATUS}
          OR ot.status = 'RIDER_ASSIGNED'
        )
    )
  `);
}
