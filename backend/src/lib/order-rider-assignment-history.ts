/**
 * Multi-rider assignment history + milestone timeline for merchant Past riders / rider timeline UI.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb, getSql } from "../db/client.js";
import { resolveRiderOrderDistanceSnapshot } from "./rider-order-distance-snapshot.js";

type DbTx = PostgresJsDatabase<Record<string, unknown>>;

export type RiderAssignmentTimelineEventType =
  | "assigned"
  | "accepted"
  | "reached_merchant"
  | "picked_up"
  | "reached_customer"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "unassigned"
  | "timeout";

export type RiderDistanceSnapshot = {
  merchantDistanceKm?: number | null;
  customerDistanceKm?: number | null;
  riderLat?: number | null;
  riderLng?: number | null;
};

export type RecordRiderAssignmentHistoryInput = {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  riderName?: string | null;
  riderMobile?: string | null;
  serviceType?: "food" | "parcel" | "person_ride";
  distance?: RiderDistanceSnapshot;
  occurredAt?: Date;
};

/** Per-rider workflow milestones from the active assignment row (not order-level state). */
export type ActiveRiderAssignmentMilestones = {
  assignmentStatus: string | null;
  reachedMerchantAt: Date | string | null;
  pickedUpAt: Date | string | null;
  reachedCustomerAt: Date | string | null;
  deliveredAt: Date | string | null;
  pickupAcknowledged: boolean;
  pickupAcknowledgedAt: Date | string | null;
};

type AssignmentMilestoneRow = {
  assignment_status: string | null;
  reached_merchant_at: Date | string | null;
  picked_up_at: Date | string | null;
  reached_customer_at: Date | string | null;
  delivered_at: Date | string | null;
  pickup_acknowledged: boolean | null;
  pickup_acknowledged_at: Date | string | null;
};

function mapAssignmentMilestoneRow(
  row: AssignmentMilestoneRow | undefined
): ActiveRiderAssignmentMilestones | null {
  if (!row) return null;
  return {
    assignmentStatus: row.assignment_status?.trim() || null,
    reachedMerchantAt: row.reached_merchant_at ?? null,
    pickedUpAt: row.picked_up_at ?? null,
    reachedCustomerAt: row.reached_customer_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    pickupAcknowledged: row.pickup_acknowledged === true,
    pickupAcknowledgedAt: row.pickup_acknowledged_at ?? null,
  };
}

/** Active assignment milestones for one order + rider (used for rider app workflow state). */
export async function loadActiveRiderAssignmentMilestones(
  dbOrTx: DbTx | ReturnType<typeof getDb>,
  orderCorePk: number,
  riderId: number
): Promise<ActiveRiderAssignmentMilestones | null> {
  const rows = await dbOrTx.execute<AssignmentMilestoneRow & { order_core_id: number }>(sql`
    SELECT
      assignment_status::text AS assignment_status,
      reached_merchant_at,
      picked_up_at,
      reached_customer_at,
      delivered_at,
      pickup_acknowledged,
      pickup_acknowledged_at
    FROM order_rider_assignments
    WHERE order_core_id = ${orderCorePk}
      AND rider_id = ${riderId}
      AND is_active = TRUE
    LIMIT 1
  `);
  return mapAssignmentMilestoneRow((rows as AssignmentMilestoneRow[])[0]);
}

/** Batch-load active assignment milestones for a rider's active orders. */
export async function loadActiveRiderAssignmentMilestonesForRider(
  dbOrTx: DbTx | ReturnType<typeof getDb>,
  riderId: number,
  orderCoreIds: number[]
): Promise<Map<number, ActiveRiderAssignmentMilestones>> {
  const ids = [...new Set(orderCoreIds.filter((id) => Number.isFinite(id) && id > 0))];
  const map = new Map<number, ActiveRiderAssignmentMilestones>();
  if (ids.length === 0) return map;

  const rows = await dbOrTx.execute<AssignmentMilestoneRow & { order_core_id: number }>(sql`
    SELECT
      order_core_id,
      assignment_status::text AS assignment_status,
      reached_merchant_at,
      picked_up_at,
      reached_customer_at,
      delivered_at,
      pickup_acknowledged,
      pickup_acknowledged_at
    FROM order_rider_assignments
    WHERE rider_id = ${riderId}
      AND is_active = TRUE
      AND order_core_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
  `);

  for (const row of rows as (AssignmentMilestoneRow & { order_core_id: number })[]) {
    const mapped = mapAssignmentMilestoneRow(row);
    if (mapped) map.set(Number(row.order_core_id), mapped);
  }
  return map;
}

function toTs(value: Date): string {
  return value.toISOString();
}

function hasDistanceValues(distance?: RiderDistanceSnapshot): boolean {
  return (
    distance?.merchantDistanceKm != null ||
    distance?.customerDistanceKm != null ||
    (distance?.riderLat != null && distance?.riderLng != null)
  );
}

async function enrichDistanceSnapshot(
  riderId: number,
  orderCorePk: number,
  distance?: RiderDistanceSnapshot
): Promise<RiderDistanceSnapshot | undefined> {
  if (hasDistanceValues(distance)) {
    if (distance!.merchantDistanceKm != null && distance!.customerDistanceKm != null) {
      return distance;
    }
    try {
      const resolved = await resolveRiderOrderDistanceSnapshot(riderId, orderCorePk, {
        lat: distance?.riderLat,
        lng: distance?.riderLng,
      });
      if (!resolved) return distance;
      return {
        riderLat: distance?.riderLat ?? resolved.riderLat,
        riderLng: distance?.riderLng ?? resolved.riderLng,
        merchantDistanceKm: distance?.merchantDistanceKm ?? resolved.merchantDistanceKm,
        customerDistanceKm: distance?.customerDistanceKm ?? resolved.customerDistanceKm,
      };
    } catch {
      return distance;
    }
  }

  try {
    return (await resolveRiderOrderDistanceSnapshot(riderId, orderCorePk)) ?? undefined;
  } catch {
    return distance;
  }
}

async function appendTimelineEvent(
  tx: DbTx,
  input: {
    riderAssignmentId: number;
    orderCorePk: number;
    orderIdText: string;
    riderId: number;
    eventType: RiderAssignmentTimelineEventType;
    occurredAt: Date;
    distance?: RiderDistanceSnapshot;
    statusMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO order_rider_assignment_timeline_events (
      rider_assignment_id,
      order_core_id,
      order_id_text,
      rider_id,
      event_type,
      occurred_at,
      merchant_distance_km,
      customer_distance_km,
      rider_latitude,
      rider_longitude,
      status_message,
      metadata
    )
    VALUES (
      ${input.riderAssignmentId},
      ${input.orderCorePk},
      ${input.orderIdText},
      ${input.riderId},
      ${input.eventType},
      ${toTs(input.occurredAt)}::timestamptz,
      ${input.distance?.merchantDistanceKm ?? null},
      ${input.distance?.customerDistanceKm ?? null},
      ${input.distance?.riderLat ?? null},
      ${input.distance?.riderLng ?? null},
      ${input.statusMessage ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    ON CONFLICT (rider_assignment_id, event_type) DO UPDATE
    SET
      occurred_at = EXCLUDED.occurred_at,
      merchant_distance_km = COALESCE(EXCLUDED.merchant_distance_km, order_rider_assignment_timeline_events.merchant_distance_km),
      customer_distance_km = COALESCE(EXCLUDED.customer_distance_km, order_rider_assignment_timeline_events.customer_distance_km),
      rider_latitude = COALESCE(EXCLUDED.rider_latitude, order_rider_assignment_timeline_events.rider_latitude),
      rider_longitude = COALESCE(EXCLUDED.rider_longitude, order_rider_assignment_timeline_events.rider_longitude),
      status_message = COALESCE(EXCLUDED.status_message, order_rider_assignment_timeline_events.status_message),
      metadata = order_rider_assignment_timeline_events.metadata || EXCLUDED.metadata
  `);
}

/** Creates a new assignment row when rider accepts; deactivates prior active rider on same order. */
export async function recordRiderAssignmentAccepted(
  tx: DbTx,
  input: RecordRiderAssignmentHistoryInput
): Promise<number> {
  const now = input.occurredAt ?? new Date();
  const serviceType = input.serviceType ?? "food";
  // Do NOT await GPS/distance enrichment inside the accept claim transaction —
  // it inflates lock time and causes rival accept timeouts / false "taken" races.
  // Use caller-provided distances only; post-commit jobs can backfill.
  const distance = hasDistanceValues(input.distance) ? input.distance : undefined;

  // Only one is_active row per order — clear all active assignments (any rider).
  await tx.execute(sql`
    UPDATE order_rider_assignments
    SET
      is_active = FALSE,
      assignment_status = CASE
        WHEN assignment_status IN ('accepted', 'assigned', 'pending') THEN 'unassigned'::rider_assignment_status
        ELSE assignment_status
      END,
      unassigned_at = COALESCE(unassigned_at, ${toTs(now)}::timestamptz),
      updated_at = ${toTs(now)}::timestamptz
    WHERE order_core_id = ${input.orderCorePk}
      AND is_active = TRUE
  `);

  const existingRows = await tx.execute<{ id: number }>(sql`
    SELECT id
    FROM order_rider_assignments
    WHERE order_core_id = ${input.orderCorePk}
      AND rider_id = ${input.riderId}
      AND assignment_status IN ('pending', 'assigned', 'accepted')
    ORDER BY id DESC
    LIMIT 1
  `);
  const existingId = Number((existingRows as { id: number }[])[0]?.id ?? 0);

  let assignmentId: number;

  if (existingId > 0) {
    await tx.execute(sql`
      UPDATE order_rider_assignments
      SET
        order_id_text = COALESCE(order_id_text, ${input.orderIdText}),
        rider_name = COALESCE(${input.riderName ?? null}, rider_name),
        rider_mobile = COALESCE(${input.riderMobile ?? null}, rider_mobile),
        assignment_status = 'accepted'::rider_assignment_status,
        service_type = ${serviceType},
        is_active = TRUE,
        assigned_at = COALESCE(assigned_at, ${toTs(now)}::timestamptz),
        accepted_at = ${toTs(now)}::timestamptz,
        reached_merchant_at = NULL,
        picked_up_at = NULL,
        reached_customer_at = NULL,
        delivered_at = NULL,
        pickup_acknowledged = FALSE,
        pickup_acknowledged_at = NULL,
        pickup_acknowledged_by = NULL,
        distance_to_merchant_km = COALESCE(${distance?.merchantDistanceKm ?? null}, distance_to_merchant_km),
        distance_to_customer_km = COALESCE(${distance?.customerDistanceKm ?? null}, distance_to_customer_km),
        assignment_metadata = assignment_metadata || ${JSON.stringify({ serviceType })}::jsonb,
        updated_at = ${toTs(now)}::timestamptz
      WHERE id = ${existingId}
    `);
    assignmentId = existingId;
  } else {
    const seqRows = await tx.execute<{ next_seq: number }>(sql`
      SELECT COALESCE(MAX(assignment_sequence), 0) + 1 AS next_seq
      FROM order_rider_assignments
      WHERE order_core_id = ${input.orderCorePk}
    `);
    const nextSeq = Number((seqRows as { next_seq: number }[])[0]?.next_seq ?? 1);

    const inserted = await tx.execute<{ id: number }>(sql`
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
        distance_to_merchant_km,
        distance_to_customer_km,
        assignment_metadata,
        created_at,
        updated_at
      )
      VALUES (
        ${input.orderCorePk},
        ${input.orderCorePk},
        ${input.orderIdText},
        ${input.riderId},
        ${input.riderName ?? null},
        ${input.riderMobile ?? null},
        'accepted'::rider_assignment_status,
        ${nextSeq},
        ${serviceType},
        TRUE,
        ${toTs(now)}::timestamptz,
        ${toTs(now)}::timestamptz,
        ${distance?.merchantDistanceKm ?? null},
        ${distance?.customerDistanceKm ?? null},
        ${JSON.stringify({ serviceType })}::jsonb,
        ${toTs(now)}::timestamptz,
        ${toTs(now)}::timestamptz
      )
      RETURNING id
    `);

    assignmentId = Number((inserted as { id: number }[])[0]?.id ?? 0);
    if (!assignmentId) {
      throw new Error("Failed to create order_rider_assignments row");
    }
  }

  await appendTimelineEvent(tx, {
    riderAssignmentId: assignmentId,
    orderCorePk: input.orderCorePk,
    orderIdText: input.orderIdText,
    riderId: input.riderId,
    eventType: "assigned",
    occurredAt: now,
    distance,
    statusMessage: "Delivery partner assigned",
  });

  await appendTimelineEvent(tx, {
    riderAssignmentId: assignmentId,
    orderCorePk: input.orderCorePk,
    orderIdText: input.orderIdText,
    riderId: input.riderId,
    eventType: "accepted",
    occurredAt: now,
    distance,
    statusMessage: input.riderName
      ? `${input.riderName} accepted the order`
      : "Rider accepted the order",
  });

  return assignmentId;
}

async function patchAssignmentRow(
  tx: DbTx,
  assignmentId: number,
  input: {
    eventType: Extract<
      RiderAssignmentTimelineEventType,
      "reached_merchant" | "picked_up" | "reached_customer" | "delivered" | "rejected" | "cancelled" | "unassigned"
    >;
    occurredAt: Date;
    distance?: RiderDistanceSnapshot;
  }
): Promise<void> {
  const ts = toTs(input.occurredAt);
  const mx = input.distance?.merchantDistanceKm ?? null;
  const cx = input.distance?.customerDistanceKm ?? null;

  switch (input.eventType) {
    case "reached_merchant":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          reached_merchant_at = COALESCE(reached_merchant_at, ${ts}::timestamptz),
          distance_to_merchant_km = COALESCE(distance_to_merchant_km, ${mx}),
          distance_to_customer_km = COALESCE(distance_to_customer_km, ${cx}),
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
    case "picked_up":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          picked_up_at = COALESCE(picked_up_at, ${ts}::timestamptz),
          picked_up_actor_type = COALESCE(picked_up_actor_type, 'rider'),
          picked_up_actor_label = COALESCE(picked_up_actor_label, 'GatiMitra App'),
          distance_to_merchant_km = COALESCE(distance_to_merchant_km, ${mx}),
          distance_to_customer_km = COALESCE(distance_to_customer_km, ${cx}),
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
    case "reached_customer":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          reached_customer_at = COALESCE(reached_customer_at, ${ts}::timestamptz),
          distance_to_merchant_km = COALESCE(distance_to_merchant_km, ${mx}),
          distance_to_customer_km = COALESCE(distance_to_customer_km, ${cx}),
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
    case "delivered":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          delivered_at = COALESCE(delivered_at, ${ts}::timestamptz),
          assignment_status = 'completed'::rider_assignment_status,
          is_active = FALSE,
          distance_to_merchant_km = COALESCE(distance_to_merchant_km, ${mx}),
          distance_to_customer_km = COALESCE(distance_to_customer_km, ${cx}),
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
    case "rejected":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          rejected_at = COALESCE(rejected_at, ${ts}::timestamptz),
          assignment_status = 'rejected'::rider_assignment_status,
          is_active = FALSE,
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
    case "cancelled":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          cancelled_at = COALESCE(cancelled_at, ${ts}::timestamptz),
          assignment_status = 'cancelled'::rider_assignment_status,
          is_active = FALSE,
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
    case "unassigned":
      await tx.execute(sql`
        UPDATE order_rider_assignments
        SET
          unassigned_at = COALESCE(unassigned_at, ${ts}::timestamptz),
          assignment_status = 'unassigned'::rider_assignment_status,
          is_active = FALSE,
          updated_at = ${ts}::timestamptz
        WHERE id = ${assignmentId}
      `);
      break;
  }
}

export async function recordRiderAssignmentMilestone(
  tx: DbTx,
  input: {
    orderCorePk: number;
    orderIdText: string;
    riderId: number;
    eventType: Extract<
      RiderAssignmentTimelineEventType,
      "reached_merchant" | "picked_up" | "reached_customer" | "delivered" | "rejected" | "cancelled" | "unassigned"
    >;
    occurredAt?: Date;
    distance?: RiderDistanceSnapshot;
    statusMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const now = input.occurredAt ?? new Date();
  const distance = await enrichDistanceSnapshot(input.riderId, input.orderCorePk, input.distance);

  const rows = await tx.execute<{ id: number }>(sql`
    SELECT id
    FROM order_rider_assignments
    WHERE order_core_id = ${input.orderCorePk}
      AND rider_id = ${input.riderId}
    ORDER BY is_active DESC, COALESCE(accepted_at, assigned_at, created_at) DESC
    LIMIT 1
  `);
  const assignmentId = Number((rows as { id: number }[])[0]?.id ?? 0);
  if (!assignmentId) return;

  await patchAssignmentRow(tx, assignmentId, {
    eventType: input.eventType,
    occurredAt: now,
    distance,
  });

  await appendTimelineEvent(tx, {
    riderAssignmentId: assignmentId,
    orderCorePk: input.orderCorePk,
    orderIdText: input.orderIdText,
    riderId: input.riderId,
    eventType: input.eventType,
    occurredAt: now,
    distance,
    statusMessage: input.statusMessage,
    metadata:
      input.metadata ??
      (input.eventType === "picked_up"
        ? {
            actor_type: "rider",
            actor_id: "GatiMitra App",
          }
        : input.eventType === "reached_merchant"
          ? {
              actor_type: "rider",
              actor_id: "GatiMitra App",
            }
          : undefined),
  });
}

/** Records delivered milestone + Mx/Cx when order is marked delivered (idempotent). */
export async function recordRiderAssignmentDeliveredIfActive(input: {
  orderCorePk: number;
  orderIdText: string;
  riderId?: number | null;
  occurredAt?: Date;
  statusMessage?: string | null;
}): Promise<void> {
  try {
    const db = getDb();
    await db.transaction(async (tx) => {
      let riderId = Number(input.riderId ?? 0);
      if (!Number.isFinite(riderId) || riderId <= 0) {
        const rows = await tx.execute<{ rider_id: number | null }>(sql`
          SELECT rider_id
          FROM orders_core
          WHERE id = ${input.orderCorePk}
          LIMIT 1
        `);
        riderId = Number((rows as { rider_id: number | null }[])[0]?.rider_id ?? 0);
      }
      if (!riderId) return;

      await recordRiderAssignmentMilestone(tx, {
        orderCorePk: input.orderCorePk,
        orderIdText: input.orderIdText,
        riderId,
        eventType: "delivered",
        occurredAt: input.occurredAt ?? new Date(),
        statusMessage: input.statusMessage ?? "Order delivered",
      });
    });
  } catch (err) {
    console.warn("[recordRiderAssignmentDeliveredIfActive]", err);
  }
}

/**
 * Post-commit: fill MX/CX on assigned + accepted timeline events.
 * Must run outside the accept claim TX so GPS lookup does not inflate lock time.
 */
export async function backfillAcceptTimelineDistances(input: {
  orderCorePk: number;
  riderId: number;
  explicitGps?: { lat?: number | null; lng?: number | null };
}): Promise<RiderDistanceSnapshot | null> {
  try {
    const distance = await enrichDistanceSnapshot(
      input.riderId,
      input.orderCorePk,
      input.explicitGps
        ? {
            riderLat: input.explicitGps.lat,
            riderLng: input.explicitGps.lng,
          }
        : undefined
    );
    if (!distance) return null;
    if (distance.merchantDistanceKm == null && distance.customerDistanceKm == null) {
      return null;
    }

    const sqlClient = getSql();

    const rows = await sqlClient`
      SELECT id
      FROM order_rider_assignments
      WHERE order_core_id = ${input.orderCorePk}
        AND rider_id = ${input.riderId}
      ORDER BY is_active DESC NULLS LAST, COALESCE(accepted_at, assigned_at, created_at) DESC
      LIMIT 1
    `;
    const assignmentId = Number((rows as unknown as { id: number }[])[0]?.id ?? 0);
    if (!assignmentId) return distance;

    const mx = distance.merchantDistanceKm ?? null;
    const cx = distance.customerDistanceKm ?? null;
    const lat = distance.riderLat ?? null;
    const lng = distance.riderLng ?? null;

    await sqlClient`
      UPDATE order_rider_assignments
      SET
        distance_to_merchant_km = COALESCE(distance_to_merchant_km, ${mx}),
        distance_to_customer_km = COALESCE(distance_to_customer_km, ${cx}),
        updated_at = NOW()
      WHERE id = ${assignmentId}
    `;

    await sqlClient`
      UPDATE order_rider_assignment_timeline_events
      SET
        merchant_distance_km = COALESCE(merchant_distance_km, ${mx}),
        customer_distance_km = COALESCE(customer_distance_km, ${cx}),
        rider_latitude = COALESCE(rider_latitude, ${lat}),
        rider_longitude = COALESCE(rider_longitude, ${lng})
      WHERE rider_assignment_id = ${assignmentId}
        AND event_type IN ('assigned', 'accepted')
        AND (
          merchant_distance_km IS NULL
          OR customer_distance_km IS NULL
        )
    `;

    return distance;
  } catch (err) {
    console.warn("[backfillAcceptTimelineDistances]", err);
    return null;
  }
}
