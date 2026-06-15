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

export type RiderActivityLogRow = {
  id: number;
  createdAt: string;
  provider: string;
  trackingOrderId: string;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  status: string;
  updatedBy: string;
  reason: string | null;
  distanceCxKm: number | null;
  distanceMxKm: number | null;
  trackingUrl: string | null;
  assignmentId: number;
};

type TimelineQueryRow = {
  id: number;
  occurredAt: unknown;
  eventType: string;
  merchantDistanceKm: unknown;
  customerDistanceKm: unknown;
  statusMessage: string | null;
  metadata: Record<string, unknown> | null;
  riderId: number | null;
  assignmentId: number;
  riderName: string | null;
  riderMobile: string | null;
  deliveryProvider: string | null;
  trackingOrderId: string | null;
  cancellationReason: string | null;
};

function formatActivityLogStatus(eventType: string): string {
  return eventType.trim().replace(/\s+/g, "_").toUpperCase();
}

function formatActivityLogProvider(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value || value.toLowerCase() === "internal") return "GatiMitra";
  return value.replace(/-/g, "_").toUpperCase();
}

function formatActivityLogDistance(km: unknown): number | null {
  if (km == null || km === "") return null;
  const n = Number(km);
  return Number.isFinite(n) ? n : null;
}

function formatActivityLogTimestamp(value: unknown): string {
  const iso = toIso(value);
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function resolveActivityUpdatedBy(
  eventType: string,
  metadata: Record<string, unknown> | null | undefined
): string {
  const meta = metadata ?? {};
  const actorType = typeof meta.actor_type === "string" ? meta.actor_type.trim() : "";
  const actorId = typeof meta.actor_id === "string" ? meta.actor_id.trim() : "";
  const updatedBy = typeof meta.updated_by === "string" ? meta.updated_by.trim() : "";

  if (updatedBy) return updatedBy;
  if (actorType && actorId) {
    if (actorType.toLowerCase() === "rider") return `Rider: ${actorId}`;
    if (actorType.toLowerCase() === "system") return "System";
    return `${actorType}: ${actorId}`;
  }
  if (actorType) return actorType;
  if (["assigned", "accepted", "reached_merchant", "picked_up", "reached_customer", "delivered"].includes(eventType)) {
    return "Rider: GatiMitra App";
  }
  return "System";
}

function resolveActivityTrackingUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  const meta = metadata ?? {};
  const candidates = [meta.tracking_url, meta.trackingUrl, meta.url];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

const CANCELLATION_EVENT_TYPES = new Set(["cancelled", "rejected", "unassigned", "timeout"]);

/** Reason is shown only when a rider assignment was cancelled/rejected/unassigned/timed out. */
function resolveActivityReason(
  eventType: string,
  statusMessage: string | null | undefined,
  cancellationReason: string | null | undefined
): string | null {
  if (!CANCELLATION_EVENT_TYPES.has(eventType)) return null;
  return statusMessage?.trim() || cancellationReason?.trim() || null;
}

function mapTimelineRow(row: TimelineQueryRow): RiderActivityLogRow {
  const status = formatActivityLogStatus(row.eventType);
  const reason = resolveActivityReason(
    row.eventType,
    row.statusMessage,
    row.cancellationReason
  );

  return {
    id: row.id,
    createdAt: formatActivityLogTimestamp(row.occurredAt),
    provider: formatActivityLogProvider(row.deliveryProvider),
    trackingOrderId: row.trackingOrderId?.trim() || "—",
    riderId: row.riderId,
    riderName: row.riderName?.trim() || null,
    riderMobile: row.riderMobile?.trim() || null,
    status,
    updatedBy: resolveActivityUpdatedBy(row.eventType, row.metadata),
    reason,
    distanceCxKm: formatActivityLogDistance(row.customerDistanceKm),
    distanceMxKm: formatActivityLogDistance(row.merchantDistanceKm),
    trackingUrl: resolveActivityTrackingUrl(row.metadata),
    assignmentId: row.assignmentId,
  };
}

function buildFallbackRowsFromAssignments(
  assignments: OrderRiderAssignmentRecord[],
  trackingOrderIdFallback: string | null
): RiderActivityLogRow[] {
  const rows: RiderActivityLogRow[] = [];
  let syntheticId = -1;

  const push = (
    assignment: OrderRiderAssignmentRecord,
    eventType: string,
    at: Date | null,
    reason?: string | null
  ) => {
    if (!at) return;
    rows.push({
      id: syntheticId--,
      createdAt: formatActivityLogTimestamp(at),
      provider: formatActivityLogProvider(assignment.deliveryProvider),
      trackingOrderId: trackingOrderIdFallback?.trim() || "—",
      riderId: assignment.riderId,
      riderName: assignment.riderName?.trim() || null,
      riderMobile: assignment.riderMobile?.trim() || null,
      status: formatActivityLogStatus(eventType),
      updatedBy: CANCELLATION_EVENT_TYPES.has(eventType)
        ? "System"
        : "Rider: GatiMitra App",
      reason: CANCELLATION_EVENT_TYPES.has(eventType)
        ? reason?.trim() || assignment.cancellationReason?.trim() || null
        : null,
      distanceCxKm: null,
      distanceMxKm: null,
      trackingUrl: null,
      assignmentId: assignment.id,
    });
  };

  for (const assignment of assignments) {
    push(assignment, "assigned", assignment.assignedAt);
    push(assignment, "accepted", assignment.acceptedAt);
    push(assignment, "reached_merchant", assignment.reachedMerchantAt);
    push(assignment, "picked_up", assignment.pickedUpAt);
    push(assignment, "delivered", assignment.deliveredAt);
    push(assignment, "rejected", assignment.rejectedAt, assignment.cancellationReason);
    push(assignment, "cancelled", assignment.cancelledAt, assignment.cancellationReason);
  }

  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * Full rider activity log for an order — every milestone for every assigned rider.
 * Backed by order_rider_assignment_timeline_events (Mx/Cx distances at event time).
 */
export async function listOrderRiderActivityLog(
  orderCoreId: number
): Promise<{ logs: RiderActivityLogRow[]; trackingOrderId: string | null }> {
  if (!Number.isFinite(orderCoreId)) {
    return { logs: [], trackingOrderId: null };
  }

  const sql = getSql();

  const orderRows = await sql`
    SELECT order_id AS "trackingOrderId"
    FROM orders_core
    WHERE id = ${orderCoreId}
    LIMIT 1
  `;
  const trackingOrderId =
    ((orderRows as { trackingOrderId?: string | null }[])[0]?.trackingOrderId as string | null) ??
    null;

  const timelineRows = (await sql`
    SELECT
      te.id,
      te.occurred_at AS "occurredAt",
      te.event_type AS "eventType",
      te.merchant_distance_km AS "merchantDistanceKm",
      te.customer_distance_km AS "customerDistanceKm",
      te.status_message AS "statusMessage",
      te.metadata,
      te.rider_id AS "riderId",
      ora.id AS "assignmentId",
      COALESCE(NULLIF(TRIM(ora.rider_name), ''), NULLIF(TRIM(r.name), '')) AS "riderName",
      COALESCE(NULLIF(TRIM(ora.rider_mobile), ''), NULLIF(TRIM(r.mobile), '')) AS "riderMobile",
      COALESCE(
        NULLIF(TRIM(ora.delivery_provider), ''),
        NULLIF(TRIM(ora.assignment_metadata->>'delivery_provider'), ''),
        NULLIF(TRIM(ora.assignment_metadata->>'provider'), ''),
        NULLIF(TRIM(op.code), ''),
        'internal'
      ) AS "deliveryProvider",
      COALESCE(NULLIF(TRIM(ora.order_id_text), ''), NULLIF(TRIM(oc.order_id), '')) AS "trackingOrderId",
      ora.cancellation_reason AS "cancellationReason"
    FROM order_rider_assignment_timeline_events te
    INNER JOIN order_rider_assignments ora ON ora.id = te.rider_assignment_id
    LEFT JOIN riders r ON r.id = te.rider_id
    LEFT JOIN orders_core oc ON oc.id = te.order_core_id
    LEFT JOIN LATERAL (
      SELECT op.code
      FROM order_provider_mapping opm
      INNER JOIN order_providers op ON op.id = opm.provider_id
      WHERE opm.order_id = ${orderCoreId}
      ORDER BY opm.created_at DESC NULLS LAST
      LIMIT 1
    ) op ON TRUE
    WHERE te.order_core_id = ${orderCoreId}
    ORDER BY te.occurred_at DESC, te.id DESC
  `) as TimelineQueryRow[];

  if (timelineRows.length > 0) {
    return {
      logs: timelineRows.map(mapTimelineRow),
      trackingOrderId,
    };
  }

  const assignments = await listOrderRiderAssignmentsForOrder(orderCoreId);
  return {
    logs: buildFallbackRowsFromAssignments(assignments, trackingOrderId),
    trackingOrderId,
  };
}

export type RiderActivityLogSummary = {
  total: number;
  cancelled: number;
  delivered: number;
  distinctRiders: number;
};

export type RiderActivityLogPayload = {
  logs: RiderActivityLogRow[];
  trackingOrderId: string | null;
  summary: RiderActivityLogSummary;
};

const CANCELLATION_ACTIVITY_STATUSES = new Set([
  "CANCELLED",
  "REJECTED",
  "UNASSIGNED",
  "TIMEOUT",
]);

export function buildRiderActivityLogSummary(logs: RiderActivityLogRow[]): RiderActivityLogSummary {
  return {
    total: logs.length,
    cancelled: logs.filter((row) => CANCELLATION_ACTIVITY_STATUSES.has(row.status)).length,
    delivered: logs.filter((row) => row.status === "DELIVERED").length,
    distinctRiders: new Set(logs.map((row) => row.riderId).filter(Boolean)).size,
  };
}

export async function getOrderRiderActivityLogPayload(
  orderCoreId: number
): Promise<RiderActivityLogPayload> {
  const { logs, trackingOrderId } = await listOrderRiderActivityLog(orderCoreId);
  return {
    logs,
    trackingOrderId,
    summary: buildRiderActivityLogSummary(logs),
  };
}

