import type { Sql } from "postgres";

export const TIMELINE_STATUS_READY = "Ready";
export const TIMELINE_STATUS_HANDOVER = "Handed Over to Rider";
export const TIMELINE_STATUS_PICKED_UP = "Picked Up";

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
  sql: Sql,
  input: {
    orderCorePk: number;
    pickedUpAt: string;
    riderId?: number | null;
    riderName?: string | null;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(sql, {
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
