/**
 * When GatiMitra dashboard agent updates order status (Dispatched / Delivered),
 * sync rider assignment milestones + timeline attribution.
 */

import { getSql } from "../client";
import type { UpdateableOrderStatus } from "./orders-core";

function toIso(d: Date): string {
  return d.toISOString();
}

async function upsertTimelineEvent(
  sql: ReturnType<typeof getSql>,
  input: {
    assignmentId: number;
    orderCoreId: number;
    orderIdText: string;
    riderId: number;
    eventType: string;
    occurredAt: Date;
    statusMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await sql`
    INSERT INTO order_rider_assignment_timeline_events (
      rider_assignment_id,
      order_core_id,
      order_id_text,
      rider_id,
      event_type,
      occurred_at,
      status_message,
      metadata
    )
    VALUES (
      ${input.assignmentId},
      ${input.orderCoreId},
      ${input.orderIdText},
      ${input.riderId},
      ${input.eventType},
      ${toIso(input.occurredAt)}::timestamptz,
      ${input.statusMessage ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    ON CONFLICT (rider_assignment_id, event_type) DO UPDATE
    SET
      occurred_at = EXCLUDED.occurred_at,
      status_message = COALESCE(EXCLUDED.status_message, order_rider_assignment_timeline_events.status_message),
      metadata = order_rider_assignment_timeline_events.metadata || EXCLUDED.metadata
  `;
}

export async function syncRiderMilestoneFromDashboardStatus(
  orderCoreId: number,
  status: UpdateableOrderStatus,
  actorEmail: string,
  occurredAt: Date
): Promise<void> {
  if (status !== "in_transit" && status !== "delivered") return;

  const sql = getSql();
  const rows = await sql`
    SELECT
      ora.id,
      ora.rider_id AS "riderId",
      ora.reached_merchant_at AS "reachedMerchantAt",
      ora.picked_up_at AS "pickedUpAt",
      ora.delivered_at AS "deliveredAt",
      COALESCE(NULLIF(TRIM(ora.order_id_text), ''), NULLIF(TRIM(oc.order_id), ''), NULLIF(TRIM(oc.formatted_order_id), '')) AS "orderIdText"
    FROM order_rider_assignments ora
    INNER JOIN orders_core oc ON oc.id = ${orderCoreId}
    WHERE (ora.order_core_id = ${orderCoreId} OR ora.order_id = ${orderCoreId})
      AND ora.rider_id IS NOT NULL
    ORDER BY ora.is_active DESC NULLS LAST, ora.assignment_sequence DESC NULLS LAST, ora.created_at DESC
    LIMIT 1
  `;

  const row = (rows as Record<string, unknown>[])[0];
  if (!row?.id) return;

  const assignmentId = Number(row.id);
  const riderId = Number(row.riderId);
  const orderIdText = String(row.orderIdText ?? orderCoreId);
  if (!Number.isFinite(riderId) || riderId < 1) return;

  const reachedAt = row.reachedMerchantAt ? new Date(String(row.reachedMerchantAt)) : null;
  const hasReached = reachedAt != null && !Number.isNaN(reachedAt.getTime());

  if (status === "in_transit") {
    const skipReach = !hasReached;
    const actorLabel = actorEmail.trim() || "GatiMitra team";

    await sql`
      UPDATE order_rider_assignments
      SET
        picked_up_at = COALESCE(picked_up_at, ${toIso(occurredAt)}::timestamptz),
        reached_merchant_skipped = CASE
          WHEN reached_merchant_skipped THEN reached_merchant_skipped
          ELSE ${skipReach}
        END,
        picked_up_actor_type = COALESCE(picked_up_actor_type, 'agent'),
        picked_up_actor_label = COALESCE(picked_up_actor_label, ${actorLabel}),
        updated_at = ${toIso(occurredAt)}::timestamptz
      WHERE id = ${assignmentId}
    `;

    if (skipReach) {
      await upsertTimelineEvent(sql, {
        assignmentId,
        orderCoreId,
        orderIdText,
        riderId,
        eventType: "reached_merchant_skipped",
        occurredAt,
        statusMessage: "Reached store skipped — pickup marked by GatiMitra team",
        metadata: {
          actor_type: "agent",
          updated_by: actorLabel,
          reason: "pickup_before_reach",
        },
      });
    }

    await upsertTimelineEvent(sql, {
      assignmentId,
      orderCoreId,
      orderIdText,
      riderId,
      eventType: "picked_up",
      occurredAt,
      statusMessage: "Picked up (GatiMitra team)",
      metadata: {
        actor_type: "agent",
        updated_by: actorLabel,
        reached_merchant_skipped: skipReach,
      },
    });

    await sql`
      UPDATE orders_food
      SET
        rider_picked_up_at = COALESCE(rider_picked_up_at, ${toIso(occurredAt)}::timestamptz),
        updated_at = ${toIso(occurredAt)}::timestamptz
      WHERE order_id = ${orderCoreId}
    `;
    return;
  }

  if (status === "delivered") {
    await sql`
      UPDATE order_rider_assignments
      SET
        delivered_at = COALESCE(delivered_at, ${toIso(occurredAt)}::timestamptz),
        assignment_status = 'completed'::rider_assignment_status,
        is_active = FALSE,
        updated_at = ${toIso(occurredAt)}::timestamptz
      WHERE id = ${assignmentId}
    `;

    await upsertTimelineEvent(sql, {
      assignmentId,
      orderCoreId,
      orderIdText,
      riderId,
      eventType: "delivered",
      occurredAt,
      statusMessage: "Delivered (GatiMitra team)",
      metadata: {
        actor_type: "agent",
        updated_by: actorEmail.trim() || "GatiMitra team",
      },
    });
  }
}
