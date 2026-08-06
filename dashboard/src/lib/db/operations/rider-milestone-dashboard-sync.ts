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

type AssignmentRow = {
  id: number;
  riderId: number;
  reachedMerchantAt: unknown;
  assignedAt: unknown;
  orderIdText: string;
};

async function findActiveAssignment(
  sql: ReturnType<typeof getSql>,
  orderCoreId: number
): Promise<AssignmentRow | null> {
  const rows = await sql`
    SELECT
      ora.id,
      ora.rider_id AS "riderId",
      ora.reached_merchant_at AS "reachedMerchantAt",
      ora.assigned_at AS "assignedAt",
      COALESCE(
        NULLIF(TRIM(ora.order_id_text), ''),
        NULLIF(TRIM(oc.order_id), ''),
        NULLIF(TRIM(oc.formatted_order_id), ''),
        ${String(orderCoreId)}
      ) AS "orderIdText"
    FROM order_rider_assignments ora
    INNER JOIN orders_core oc ON oc.id = ${orderCoreId}
    WHERE ora.rider_id IS NOT NULL
      AND (
        ora.order_core_id = ${orderCoreId}
        OR ora.order_id = ${orderCoreId}
        OR (oc.rider_id IS NOT NULL AND ora.rider_id = oc.rider_id)
      )
    ORDER BY
      CASE WHEN ora.order_core_id = ${orderCoreId} OR ora.order_id = ${orderCoreId} THEN 0 ELSE 1 END,
      ora.is_active DESC NULLS LAST,
      ora.assignment_sequence DESC NULLS LAST,
      ora.created_at DESC
    LIMIT 1
  `;

  const row = (rows as Record<string, unknown>[])[0];
  if (!row?.id) return null;

  const riderId = Number(row.riderId);
  if (!Number.isFinite(riderId) || riderId < 1) return null;

  return {
    id: Number(row.id),
    riderId,
    reachedMerchantAt: row.reachedMerchantAt,
    assignedAt: row.assignedAt,
    orderIdText: String(row.orderIdText ?? orderCoreId),
  };
}

/**
 * Ensure an assignment row exists when orders_core already has a rider
 * (hard-assign / force-assign edge cases).
 */
async function ensureAssignmentFromCoreRider(
  sql: ReturnType<typeof getSql>,
  orderCoreId: number,
  occurredAt: Date
): Promise<AssignmentRow | null> {
  const coreRows = await sql`
    SELECT
      oc.rider_id AS "riderId",
      COALESCE(NULLIF(TRIM(oc.order_id), ''), NULLIF(TRIM(oc.formatted_order_id), ''), ${String(orderCoreId)}) AS "orderIdText",
      NULLIF(TRIM(r.name), '') AS "riderName",
      NULLIF(TRIM(r.mobile), '') AS "riderMobile"
    FROM orders_core oc
    LEFT JOIN riders r ON r.id = oc.rider_id
    WHERE oc.id = ${orderCoreId}
      AND oc.rider_id IS NOT NULL
    LIMIT 1
  `;
  const core = (coreRows as Record<string, unknown>[])[0];
  if (!core?.riderId) return null;

  const riderId = Number(core.riderId);
  if (!Number.isFinite(riderId) || riderId < 1) return null;
  const orderIdText = String(core.orderIdText ?? orderCoreId);
  const nowIso = toIso(occurredAt);

  const inserted = await sql`
    INSERT INTO order_rider_assignments (
      order_id,
      order_core_id,
      order_id_text,
      rider_id,
      rider_name,
      rider_mobile,
      assignment_status,
      assignment_sequence,
      service_type,
      is_active,
      assigned_at,
      accepted_at,
      assignment_metadata,
      created_at,
      updated_at
    )
    VALUES (
      ${orderCoreId},
      ${orderCoreId},
      ${orderIdText},
      ${riderId},
      ${(core.riderName as string | null) ?? null},
      ${(core.riderMobile as string | null) ?? null},
      'accepted'::rider_assignment_status,
      1,
      'food',
      TRUE,
      ${nowIso}::timestamptz,
      ${nowIso}::timestamptz,
      ${JSON.stringify({ source: "dashboard_status_sync" })}::jsonb,
      ${nowIso}::timestamptz,
      ${nowIso}::timestamptz
    )
    RETURNING id
  `;

  const id = Number((inserted as unknown as { id: number }[])[0]?.id);
  if (!Number.isFinite(id) || id < 1) return null;

  return {
    id,
    riderId,
    reachedMerchantAt: null,
    assignedAt: occurredAt,
    orderIdText,
  };
}

async function markPickedUpOnAssignment(
  sql: ReturnType<typeof getSql>,
  assignmentId: number,
  occurredAt: Date,
  skipReach: boolean,
  actorLabel: string
): Promise<void> {
  const nowIso = toIso(occurredAt);
  try {
    await sql`
      UPDATE order_rider_assignments
      SET
        picked_up_at = COALESCE(picked_up_at, ${nowIso}::timestamptz),
        reached_merchant_skipped = CASE
          WHEN reached_merchant_skipped THEN reached_merchant_skipped
          ELSE ${skipReach}
        END,
        picked_up_actor_type = COALESCE(picked_up_actor_type, 'agent'),
        picked_up_actor_label = COALESCE(picked_up_actor_label, ${actorLabel}),
        updated_at = ${nowIso}::timestamptz
      WHERE id = ${assignmentId}
    `;
  } catch (err) {
    console.warn(
      "[syncRiderMilestone] attribution columns unavailable, falling back to picked_up_at only:",
      err
    );
    await sql`
      UPDATE order_rider_assignments
      SET
        picked_up_at = COALESCE(picked_up_at, ${nowIso}::timestamptz),
        updated_at = ${nowIso}::timestamptz
      WHERE id = ${assignmentId}
    `;
  }
}

export async function syncRiderMilestoneFromDashboardStatus(
  orderCoreId: number,
  status: UpdateableOrderStatus,
  actorEmail: string,
  occurredAt: Date
): Promise<void> {
  if (status !== "in_transit" && status !== "delivered") return;

  const sql = getSql();
  let assignment = await findActiveAssignment(sql, orderCoreId);
  if (!assignment && status === "in_transit") {
    try {
      assignment = await ensureAssignmentFromCoreRider(sql, orderCoreId, occurredAt);
    } catch (err) {
      console.warn("[syncRiderMilestone] ensure assignment failed:", err);
    }
  }
  if (!assignment) {
    console.warn(
      `[syncRiderMilestone] no assignment for order_core_id=${orderCoreId} status=${status}`
    );
    return;
  }

  const { id: assignmentId, riderId, orderIdText } = assignment;
  const actorLabel = actorEmail.trim() || "GatiMitra team";

  const reachedAt = assignment.reachedMerchantAt
    ? new Date(String(assignment.reachedMerchantAt))
    : null;
  const hasReached = reachedAt != null && !Number.isNaN(reachedAt.getTime());

  if (status === "in_transit") {
    const skipReach = !hasReached;

    await markPickedUpOnAssignment(sql, assignmentId, occurredAt, skipReach, actorLabel);

    // Ensure activity log always has an Assigned row for this assignment.
    const assignedAt = assignment.assignedAt
      ? new Date(String(assignment.assignedAt))
      : occurredAt;
    try {
      await upsertTimelineEvent(sql, {
        assignmentId,
        orderCoreId,
        orderIdText,
        riderId,
        eventType: "assigned",
        occurredAt:
          assignedAt != null && !Number.isNaN(assignedAt.getTime()) ? assignedAt : occurredAt,
        statusMessage: "Rider assigned",
        metadata: { actor_type: "system", source: "dashboard_status_sync" },
      });
    } catch (err) {
      console.warn("[syncRiderMilestone] assigned event upsert failed:", err);
    }

    if (skipReach) {
      try {
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
      } catch (err) {
        console.warn("[syncRiderMilestone] reached_merchant_skipped upsert failed:", err);
      }
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
        updated_by: actorLabel,
      },
    });
  }
}
