/**
 * Person-ride rider assignment projection — OMS v2 events + delivery_assignments.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ulid } from "ulid";
import {
  recordRiderAssignmentAccepted,
  recordRiderAssignmentMilestone,
} from "./order-rider-assignment-history.js";

type DbTx = PostgresJsDatabase<Record<string, unknown>>;

export type RecordRideAcceptInput = {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  riderName?: string | null;
  riderMobile?: string | null;
  serviceType?: "food" | "parcel" | "person_ride";
  occurredAt?: Date;
};

export type RecordRideReachedPickupInput = {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  occurredAt?: Date;
};

export type RecordRideRiderUnassignInput = {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  reasonCode: string;
  reasonText?: string | null;
  coreStatusBefore: string;
  occurredAt?: Date;
};

async function insertAssignmentEvent(
  tx: DbTx,
  args: {
    orderIdText: string;
    riderId: number | null;
    eventType: "accepted" | "unassigned" | "rejected" | "completed";
    idempotencyKey: string;
    actorType: string;
    actorId: string;
    reasonCode?: string | null;
    metadata?: Record<string, unknown>;
    occurredAt: Date;
  }
): Promise<string> {
  const eventId = `rae_${ulid()}`;
  await tx.execute(sql`
    INSERT INTO order_rider_assignment_events (
      event_id,
      order_id,
      rider_id,
      event_type,
      actor_type,
      actor_id,
      reason_code,
      idempotency_key,
      metadata,
      created_at
    )
    VALUES (
      ${eventId},
      ${args.orderIdText},
      ${args.riderId},
      ${args.eventType},
      ${args.actorType},
      ${args.actorId},
      ${args.reasonCode ?? null},
      ${args.idempotencyKey},
      ${JSON.stringify(args.metadata ?? {})}::jsonb,
      ${args.occurredAt.toISOString()}::timestamptz
    )
    ON CONFLICT (order_id, idempotency_key) DO NOTHING
  `);
  return eventId;
}

/** Rider accepted dispatch order — rider bucket + tracking projection. */
export async function recordRiderOrderAccepted(
  tx: DbTx,
  input: RecordRideAcceptInput
): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const { orderIdText, riderId } = input;
  const serviceType = input.serviceType ?? "person_ride";

  await insertAssignmentEvent(tx, {
    orderIdText,
    riderId,
    eventType: "accepted",
    idempotencyKey: `${serviceType}_accept:${orderIdText}:${riderId}`,
    actorType: "rider",
    actorId: String(riderId),
    metadata: { serviceType, orderCorePk: input.orderCorePk },
    occurredAt: now,
  });

  await tx.execute(sql`
    INSERT INTO order_rider_assignments_current (order_id, rider_id, status, assigned_at, updated_at)
    VALUES (${orderIdText}, ${riderId}, 'accepted', ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
    ON CONFLICT (order_id) DO UPDATE
    SET rider_id = EXCLUDED.rider_id, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    WHERE order_rider_assignments_current.rider_id IS NULL
       OR order_rider_assignments_current.rider_id = EXCLUDED.rider_id
  `);

  await tx.execute(sql`
    INSERT INTO delivery_assignments (
      order_id,
      rider_id,
      assignment_status,
      assigned_at,
      accepted_at,
      created_at,
      updated_at
    )
    VALUES (
      ${orderIdText},
      ${riderId},
      'ACCEPTED',
      ${now.toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz
    )
    ON CONFLICT (order_id) DO UPDATE
    SET
      rider_id = EXCLUDED.rider_id,
      assignment_status = EXCLUDED.assignment_status,
      assigned_at = COALESCE(delivery_assignments.assigned_at, EXCLUDED.assigned_at),
      accepted_at = EXCLUDED.accepted_at,
      picked_up_at = NULL,
      delivered_at = NULL,
      updated_at = EXCLUDED.updated_at
    WHERE delivery_assignments.rider_id IS NULL
       OR delivery_assignments.rider_id = EXCLUDED.rider_id
  `);

  if (serviceType === "food" || serviceType === "parcel") {
    await recordRiderAssignmentAccepted(tx, {
      orderCorePk: input.orderCorePk,
      orderIdText,
      riderId,
      riderName: input.riderName,
      riderMobile: input.riderMobile,
      serviceType,
      occurredAt: now,
    });
  }
}

/** Rider accepted ride — rider bucket + tracking projection. */
export async function recordRideRiderAccepted(
  tx: DbTx,
  input: RecordRideAcceptInput
): Promise<void> {
  return recordRiderOrderAccepted(tx, { ...input, serviceType: "person_ride" });
}

/** Rider marked reached pickup. */
export async function recordRideRiderReachedPickup(
  tx: DbTx,
  input: RecordRideReachedPickupInput
): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const { orderIdText, riderId, orderCorePk } = input;

  await tx.execute(sql`
    UPDATE orders_ride
    SET rider_reached_pickup_at = COALESCE(rider_reached_pickup_at, ${now.toISOString()}::timestamptz),
        updated_at = ${now.toISOString()}::timestamptz
    WHERE order_id = ${orderCorePk}
  `);

  await tx.execute(sql`
    UPDATE delivery_assignments
    SET assignment_status = 'AT_PICKUP', updated_at = ${now.toISOString()}::timestamptz
    WHERE order_id = ${orderIdText} AND rider_id = ${riderId}
  `);
}

/** Rider backs out after accept — audit + return order to dispatch pool. */
export async function recordRideRiderUnassign(
  tx: DbTx,
  input: RecordRideRiderUnassignInput
): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const { orderIdText, riderId, orderCorePk, reasonCode } = input;
  const reasonText = input.reasonText?.trim() || null;
  const statusMessage = reasonText || reasonCode;

  await tx.execute(sql`
    INSERT INTO order_rider_ride_unassignments (
      order_core_id,
      order_id,
      rider_id,
      reason_code,
      reason_text,
      core_status_before,
      core_status_after,
      metadata,
      created_at
    )
    VALUES (
      ${orderCorePk},
      ${orderIdText},
      ${riderId},
      ${reasonCode},
      ${reasonText},
      ${input.coreStatusBefore},
      'SEARCHING_RIDER',
      ${JSON.stringify({ serviceType: "person_ride" })}::jsonb,
      ${now.toISOString()}::timestamptz
    )
  `);

  await insertAssignmentEvent(tx, {
    orderIdText,
    riderId,
    eventType: "unassigned",
    idempotencyKey: `ride_unassign:${orderIdText}:${riderId}:${now.getTime()}`,
    actorType: "rider",
    actorId: String(riderId),
    reasonCode,
    metadata: {
      serviceType: "person_ride",
      orderCorePk,
      reasonText,
    },
    occurredAt: now,
  });

  await recordRiderAssignmentMilestone(tx, {
    orderCorePk,
    orderIdText,
    riderId,
    eventType: "cancelled",
    occurredAt: now,
    statusMessage,
    metadata: {
      actor_type: "rider",
      actor_id: "GatiMitra App",
      reason_code: reasonCode,
      reason_text: reasonText,
      riderSelfCancelled: true,
      serviceType: "person_ride",
    },
  });

  await tx.execute(sql`
    UPDATE order_rider_assignments
    SET
      cancellation_reason = ${reasonText},
      cancellation_reason_code = ${reasonCode},
      cancelled_by = ${String(riderId)},
      cancelled_at = COALESCE(cancelled_at, ${now.toISOString()}::timestamptz),
      assignment_status = 'cancelled'::rider_assignment_status,
      is_active = FALSE,
      updated_at = ${now.toISOString()}::timestamptz
    WHERE order_core_id = ${orderCorePk}
      AND rider_id = ${riderId}
      AND is_active = TRUE
  `);

  await tx.execute(sql`
    DELETE FROM order_rider_assignments_current WHERE order_id = ${orderIdText}
  `);

  await tx.execute(sql`
    UPDATE delivery_assignments
    SET
      assignment_status = 'CANCELLED',
      updated_at = ${now.toISOString()}::timestamptz
    WHERE order_id = ${orderIdText} AND rider_id = ${riderId}
  `);
}

export type RecordFoodRiderUnassignInput = {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  reasonCode: string;
  reasonText?: string | null;
  removedBy?: string | null;
  actorType?: string;
  actorId?: string;
  foodStatus: string;
  occurredAt?: Date;
};

export type RecordFoodRiderAdminCancelledInput = RecordFoodRiderUnassignInput & {
  cancelledBy?: string | null;
};

/** Agent cancelled an assigned food rider — marks assignment cancelled with reason. */
export async function recordFoodRiderAdminCancelled(
  tx: DbTx,
  input: RecordFoodRiderAdminCancelledInput
): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const { orderIdText, riderId, orderCorePk, reasonCode } = input;
  const reasonText = input.reasonText?.trim() || null;
  const actorType = input.actorType ?? "admin";
  const actorId = input.actorId ?? input.removedBy ?? "system";
  const cancelledByEmail =
    (input.removedBy?.includes("@") ? input.removedBy.trim() : null) ??
    (input.actorId?.includes("@") ? input.actorId.trim() : null) ??
    (input.cancelledBy?.includes("@") ? input.cancelledBy.trim() : null);
  const baseReason = reasonText ?? "Rider cancelled by agent";
  const statusMessage = cancelledByEmail
    ? `${baseReason}\nCancelled by - ${cancelledByEmail}`
    : baseReason;

  await insertAssignmentEvent(tx, {
    orderIdText,
    riderId,
    eventType: "unassigned",
    idempotencyKey: `food_admin_cancel:${orderIdText}:${riderId}:${now.getTime()}`,
    actorType,
    actorId,
    reasonCode,
    metadata: {
      serviceType: "food",
      orderCorePk,
      reasonText,
      removedBy: input.removedBy ?? null,
      foodStatus: input.foodStatus,
      adminCancelled: true,
    },
    occurredAt: now,
  });

  await tx.execute(sql`
    DELETE FROM order_rider_assignments_current WHERE order_id = ${orderIdText}
  `);

  await tx.execute(sql`
    UPDATE delivery_assignments
    SET assignment_status = 'CANCELLED', updated_at = ${now.toISOString()}::timestamptz
    WHERE order_id = ${orderIdText} AND rider_id = ${riderId}
  `);

  await recordRiderAssignmentMilestone(tx, {
    orderCorePk,
    orderIdText,
    riderId,
    eventType: "cancelled",
    occurredAt: now,
    statusMessage,
    metadata: {
      actor_type: actorType,
      actor_id: "GatimitraTeam",
      updated_by: "GatimitraTeam",
      adminCancelled: true,
      reason_code: reasonCode,
      reason_text: reasonText,
      serviceType: "food",
    },
  });

  await tx.execute(sql`
    UPDATE order_rider_assignments
    SET
      cancellation_reason = ${reasonText},
      cancellation_reason_code = ${reasonCode},
      cancelled_by = ${input.cancelledBy ?? actorId},
      cancelled_at = COALESCE(cancelled_at, ${now.toISOString()}::timestamptz),
      assignment_status = 'cancelled'::rider_assignment_status,
      is_active = FALSE,
      updated_at = ${now.toISOString()}::timestamptz
    WHERE order_core_id = ${orderCorePk}
      AND rider_id = ${riderId}
      AND is_active = TRUE
  `);
}

/** Food rider unassigned — merchant food status is never changed here. */
export async function recordFoodRiderUnassigned(
  tx: DbTx,
  input: RecordFoodRiderUnassignInput
): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const { orderIdText, riderId, orderCorePk, reasonCode } = input;
  const reasonText = input.reasonText?.trim() || null;
  const actorType = input.actorType ?? "system";
  const actorId = input.actorId ?? input.removedBy ?? "system";
  const isRiderSelfCancel = actorType === "rider";
  const statusMessage = reasonText || reasonCode || (isRiderSelfCancel ? "Rider cancelled" : "Rider unassigned");
  const timelineEventType = isRiderSelfCancel ? ("cancelled" as const) : ("unassigned" as const);

  await insertAssignmentEvent(tx, {
    orderIdText,
    riderId,
    eventType: "unassigned",
    idempotencyKey: `food_unassign:${orderIdText}:${riderId}:${now.getTime()}`,
    actorType,
    actorId,
    reasonCode,
    metadata: {
      serviceType: "food",
      orderCorePk,
      reasonText,
      reasonCode,
      removedBy: input.removedBy ?? null,
      foodStatus: input.foodStatus,
      riderSelfCancelled: isRiderSelfCancel,
    },
    occurredAt: now,
  });

  await tx.execute(sql`
    DELETE FROM order_rider_assignments_current WHERE order_id = ${orderIdText}
  `);

  await tx.execute(sql`
    UPDATE delivery_assignments
    SET assignment_status = 'CANCELLED', updated_at = ${now.toISOString()}::timestamptz
    WHERE order_id = ${orderIdText} AND rider_id = ${riderId}
  `);

  await recordRiderAssignmentMilestone(tx, {
    orderCorePk,
    orderIdText,
    riderId,
    eventType: timelineEventType,
    occurredAt: now,
    statusMessage,
    metadata: {
      actor_type: actorType,
      actor_id: isRiderSelfCancel ? "GatiMitra App" : actorId,
      reason_code: reasonCode,
      reason_text: reasonText,
      riderSelfCancelled: isRiderSelfCancel,
      serviceType: "food",
      foodStatus: input.foodStatus,
    },
  });

  if (isRiderSelfCancel) {
    await tx.execute(sql`
      UPDATE order_rider_assignments
      SET
        cancellation_reason = ${reasonText},
        cancellation_reason_code = ${reasonCode},
        cancelled_by = ${String(riderId)},
        cancelled_at = COALESCE(cancelled_at, ${now.toISOString()}::timestamptz),
        assignment_status = 'cancelled'::rider_assignment_status,
        is_active = FALSE,
        updated_at = ${now.toISOString()}::timestamptz
      WHERE order_core_id = ${orderCorePk}
        AND rider_id = ${riderId}
        AND is_active = TRUE
    `);
  }
}
