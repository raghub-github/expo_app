import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

type DbTx = PostgresJsDatabase<Record<string, unknown>>;

export const TIMELINE_STATUS_READY = "Ready";
export const TIMELINE_STATUS_HANDOVER = "Handed Over to Rider";
export const TIMELINE_STATUS_PICKED_UP = "Picked Up";
export const TIMELINE_STATUS_DISPATCHED = "Dispatched";
export const TIMELINE_STATUS_DELIVERED = "Delivered";

export type FoodStatusTimelineInput = {
  orderCorePk: number;
  status: string;
  previousStatus?: string | null;
  actorType: string;
  statusMessage?: string | null;
  occurredAt?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: number | null;
  actorName?: string | null;
};

export async function appendOrderFoodStatusTimeline(
  sql: Sql,
  input: FoodStatusTimelineInput
): Promise<boolean> {
  const occurredAt = input.occurredAt?.trim() || new Date().toISOString();
  const message = input.statusMessage?.trim() || input.status;
  const meta = JSON.stringify(input.metadata ?? {});

  const inserted = await sql`
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
      ${input.status},
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
      ${input.actorType},
      ${input.actorId ?? null},
      ${input.actorName ?? null},
      ${message},
      ${meta}::jsonb,
      ${occurredAt}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk} AND ot.status = ${input.status}
    )
    RETURNING id
  `;
  return inserted.length > 0;
}

export async function recordReadyTimeline(
  sql: Sql,
  input: {
    orderCorePk: number;
    previousStatus?: string | null;
    preparedAt?: string | null;
    actionSource?: string;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(sql, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_READY,
    previousStatus: input.previousStatus,
    actorType: "store",
    statusMessage: "Order marked ready for pickup",
    occurredAt: input.preparedAt ?? undefined,
    metadata: { action_source: input.actionSource ?? "app" },
  });
}

export async function recordHandoverTimeline(
  sql: Sql,
  input: { orderCorePk: number; handedOverAt: string }
): Promise<void> {
  await appendOrderFoodStatusTimeline(sql, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_HANDOVER,
    actorType: "store",
    statusMessage: "Food handed over to delivery partner (pickup OTP verified)",
    occurredAt: input.handedOverAt,
    metadata: { verified_by: "merchant" },
  });
}

export async function recordRiderPickedUpTimeline(
  sqlClient: Sql,
  input: {
    orderCorePk: number;
    pickedUpAt: string;
    riderId?: number | null;
    riderName?: string | null;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(sqlClient, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_PICKED_UP,
    actorType: "rider",
    actorId: input.riderId ?? null,
    actorName: input.riderName ?? null,
    statusMessage: input.riderName
      ? `Picked up by ${input.riderName}`
      : "Order picked up by delivery partner",
    occurredAt: input.pickedUpAt,
    metadata: {
      rider_id: input.riderId ?? null,
      rider_name: input.riderName ?? null,
    },
  });
}

/** Merchant order_timelines only — called when rider confirms pickup OTP. */
export async function recordRiderPickedUpTimelineTx(
  tx: DbTx,
  input: {
    orderCorePk: number;
    pickedUpAt: Date;
    riderId?: number | null;
    riderName?: string | null;
  }
): Promise<void> {
  const occurredAt = input.pickedUpAt.toISOString();
  const message = input.riderName
    ? `Picked up by ${input.riderName}`
    : "Order picked up by delivery partner";
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
      ${TIMELINE_STATUS_PICKED_UP},
      (
        SELECT ot.status
        FROM order_timelines ot
        WHERE ot.order_id = ${input.orderCorePk}
        ORDER BY ot.occurred_at DESC, ot.id DESC
        LIMIT 1
      ),
      'rider',
      ${input.riderId ?? null},
      ${input.riderName ?? null},
      ${message},
      ${JSON.stringify({
        rider_id: input.riderId ?? null,
        rider_name: input.riderName ?? null,
      })}::jsonb,
      ${occurredAt}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk} AND ot.status = ${TIMELINE_STATUS_PICKED_UP}
    )
  `);
}

/** Merchant order_timelines — after rider confirms pickup OTP. */
export async function recordDispatchedTimelineTx(
  tx: DbTx,
  input: {
    orderCorePk: number;
    dispatchedAt: Date;
    riderId?: number | null;
    riderName?: string | null;
  }
): Promise<void> {
  const occurredAt = input.dispatchedAt.toISOString();
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
      ${TIMELINE_STATUS_DISPATCHED},
      (
        SELECT ot.status
        FROM order_timelines ot
        WHERE ot.order_id = ${input.orderCorePk}
        ORDER BY ot.occurred_at DESC, ot.id DESC
        LIMIT 1
      ),
      'rider',
      ${input.riderId ?? null},
      ${input.riderName ?? null},
      'Order dispatched for delivery',
      ${JSON.stringify({
        rider_id: input.riderId ?? null,
        rider_name: input.riderName ?? null,
      })}::jsonb,
      ${occurredAt}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk} AND ot.status = ${TIMELINE_STATUS_DISPATCHED}
    )
  `);
}

/** Merchant order_timelines — rider delivery OTP verified. */
export async function recordDeliveredTimelineTx(
  tx: DbTx,
  input: {
    orderCorePk: number;
    deliveredAt: Date;
    riderId?: number | null;
    riderName?: string | null;
  }
): Promise<void> {
  const occurredAt = input.deliveredAt.toISOString();
  const message = input.riderName
    ? `Delivered by ${input.riderName}`
    : "Order delivered";
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
      ${TIMELINE_STATUS_DELIVERED},
      (
        SELECT ot.status
        FROM order_timelines ot
        WHERE ot.order_id = ${input.orderCorePk}
        ORDER BY ot.occurred_at DESC, ot.id DESC
        LIMIT 1
      ),
      'rider',
      ${input.riderId ?? null},
      ${input.riderName ?? null},
      ${message},
      ${JSON.stringify({
        rider_id: input.riderId ?? null,
        rider_name: input.riderName ?? null,
      })}::jsonb,
      ${occurredAt}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk} AND ot.status = ${TIMELINE_STATUS_DELIVERED}
    )
  `);
}
