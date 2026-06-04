import { getSql } from "../client";

export interface OrderRiderAssignmentRecord {
  id: number;
  orderId: number;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  deliveryProvider: string | null;
  assignmentStatus: string;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  reachedMerchantAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

/**
 * List all rider assignments for an order from order_rider_assignments.
 * Assumes orders_core.id == orders.id for the given order.
 */
export async function listOrderRiderAssignmentsForOrder(
  orderId: number
): Promise<OrderRiderAssignmentRecord[]> {
  const sql = getSql();

  const rows = await sql`
    SELECT
      ora.id,
      ora.order_id              AS "orderId",
      ora.rider_id              AS "riderId",
      COALESCE(NULLIF(TRIM(ora.rider_name), ''), NULLIF(TRIM(r.name), '')) AS "riderName",
      COALESCE(NULLIF(TRIM(ora.rider_mobile), ''), NULLIF(TRIM(r.mobile), '')) AS "riderMobile",
      COALESCE(
        NULLIF(TRIM(ora.delivery_provider), ''),
        NULLIF(TRIM(ora.assignment_metadata->>'delivery_provider'), ''),
        NULLIF(TRIM(ora.assignment_metadata->>'provider'), ''),
        NULLIF(TRIM(op.code), '')
      ) AS "deliveryProvider",
      ora.assignment_status     AS "assignmentStatus",
      ora.assigned_at           AS "assignedAt",
      ora.accepted_at           AS "acceptedAt",
      ora.rejected_at           AS "rejectedAt",
      ora.reached_merchant_at   AS "reachedMerchantAt",
      ora.picked_up_at          AS "pickedUpAt",
      ora.delivered_at          AS "deliveredAt",
      ora.cancelled_at          AS "cancelledAt",
      ora.cancellation_reason   AS "cancellationReason"
    FROM order_rider_assignments ora
    LEFT JOIN riders r ON r.id = ora.rider_id
    LEFT JOIN LATERAL (
      SELECT op.code
      FROM order_provider_mapping opm
      INNER JOIN order_providers op ON op.id = opm.provider_id
      WHERE opm.order_id = ${orderId}
      ORDER BY opm.created_at DESC NULLS LAST
      LIMIT 1
    ) op ON TRUE
    WHERE ora.order_core_id = ${orderId}
       OR ora.order_id = ${orderId}
    ORDER BY ora.assignment_sequence DESC NULLS LAST,
             ora.assigned_at DESC NULLS LAST,
             ora.created_at DESC
  `;

  return (rows as any[]).map((r) => ({
    ...r,
    assignedAt:
      r.assignedAt instanceof Date ? r.assignedAt : r.assignedAt ? new Date(r.assignedAt) : null,
    acceptedAt:
      r.acceptedAt instanceof Date ? r.acceptedAt : r.acceptedAt ? new Date(r.acceptedAt) : null,
    rejectedAt:
      r.rejectedAt instanceof Date ? r.rejectedAt : r.rejectedAt ? new Date(r.rejectedAt) : null,
    reachedMerchantAt:
      r.reachedMerchantAt instanceof Date
        ? r.reachedMerchantAt
        : r.reachedMerchantAt
          ? new Date(r.reachedMerchantAt)
          : null,
    pickedUpAt:
      r.pickedUpAt instanceof Date ? r.pickedUpAt : r.pickedUpAt ? new Date(r.pickedUpAt) : null,
    deliveredAt:
      r.deliveredAt instanceof Date ? r.deliveredAt : r.deliveredAt ? new Date(r.deliveredAt) : null,
    cancelledAt:
      r.cancelledAt instanceof Date ? r.cancelledAt : r.cancelledAt ? new Date(r.cancelledAt) : null,
  })) as OrderRiderAssignmentRecord[];
}

export type RiderAssignmentTimelineEvent = {
  event_type: string;
  occurred_at: string;
  merchant_distance_km: number | null;
  customer_distance_km: number | null;
  status_message: string | null;
};

export type RiderAssignmentTimelineData = {
  assigned_at: string | null;
  accepted_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  events: RiderAssignmentTimelineEvent[];
};

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Rider milestone timeline for one assignment (Assigned → Reached Mx → Picked up → Delivered).
 * orderCoreId is orders_core.id (same as dashboard order detail id).
 */
export async function getRiderAssignmentTimeline(
  orderCoreId: number,
  riderId: number
): Promise<RiderAssignmentTimelineData> {
  const empty: RiderAssignmentTimelineData = {
    assigned_at: null,
    accepted_at: null,
    reached_merchant_at: null,
    picked_up_at: null,
    delivered_at: null,
    events: [],
  };

  if (!Number.isFinite(orderCoreId) || !Number.isFinite(riderId)) return empty;

  const sql = getSql();

  const assignmentRows = await sql`
    SELECT
      id,
      assigned_at,
      accepted_at,
      reached_merchant_at,
      picked_up_at,
      delivered_at
    FROM order_rider_assignments
    WHERE rider_id = ${riderId}
      AND (order_core_id = ${orderCoreId} OR order_id = ${orderCoreId})
    ORDER BY is_active DESC NULLS LAST, assignment_sequence DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;

  const assignment = (assignmentRows as Record<string, unknown>[])[0];
  if (!assignment?.id) return empty;

  const assignmentId = Number(assignment.id);
  const eventRows = await sql`
    SELECT
      event_type,
      occurred_at,
      merchant_distance_km,
      customer_distance_km,
      status_message
    FROM order_rider_assignment_timeline_events
    WHERE rider_assignment_id = ${assignmentId}
    ORDER BY occurred_at ASC, id ASC
  `;

  const events = (eventRows as Record<string, unknown>[]).map((row) => ({
    event_type: String(row.event_type ?? ""),
    occurred_at: toIso(row.occurred_at) ?? "",
    merchant_distance_km:
      row.merchant_distance_km == null ? null : Number(row.merchant_distance_km),
    customer_distance_km:
      row.customer_distance_km == null ? null : Number(row.customer_distance_km),
    status_message: row.status_message == null ? null : String(row.status_message),
  }));

  const pickEvent = (type: string) =>
    events.find((e) => e.event_type === type)?.occurred_at ?? null;

  return {
    assigned_at: toIso(assignment.assigned_at) ?? pickEvent("assigned"),
    accepted_at: toIso(assignment.accepted_at) ?? pickEvent("accepted"),
    reached_merchant_at:
      toIso(assignment.reached_merchant_at) ?? pickEvent("reached_merchant"),
    picked_up_at: toIso(assignment.picked_up_at) ?? pickEvent("picked_up"),
    delivered_at: toIso(assignment.delivered_at) ?? pickEvent("delivered"),
    events,
  };
}

