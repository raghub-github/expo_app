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

/**
 * Distinct riders who explicitly refused/rejected delivering this order.
 * Used for Locality GREEN→RED (RED only when count ≥ 2).
 */
export async function countDistinctRidersWhoRefusedDelivery(
  orderCoreId: number
): Promise<number> {
  if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) return 0;
  const sql = getSql();
  const riderIds = new Set<number>();

  try {
    const auditRows = (await sql`
      SELECT DISTINCT a.rider_id AS "riderId"
      FROM order_rider_dispatch_assignment_audit a
      WHERE a.order_core_id = ${orderCoreId}
        AND a.rider_id IS NOT NULL
        AND a.event_type = 'rejected'
    `) as Array<{ riderId?: number | null }>;
    for (const row of auditRows) {
      const id = Number(row.riderId);
      if (Number.isFinite(id) && id > 0) riderIds.add(id);
    }
  } catch {
    /* audit table optional */
  }

  try {
    const assignmentRows = (await sql`
      SELECT DISTINCT ora.rider_id AS "riderId"
      FROM order_rider_assignments ora
      WHERE (ora.order_core_id = ${orderCoreId} OR ora.order_id = ${orderCoreId})
        AND ora.rider_id IS NOT NULL
        AND (
          ora.rejected_at IS NOT NULL
          OR lower(coalesce(ora.assignment_status, '')) IN ('rejected', 'declined', 'refused')
        )
    `) as Array<{ riderId?: number | null }>;
    for (const row of assignmentRows) {
      const id = Number(row.riderId);
      if (Number.isFinite(id) && id > 0) riderIds.add(id);
    }
  } catch {
    /* assignments optional */
  }

  return riderIds.size;
}

export type RiderAssignmentTimelineEvent = {
  event_type: string;
  occurred_at: string;
  merchant_distance_km: number | null;
  customer_distance_km: number | null;
  status_message: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RiderAssignmentTimelineData = {
  assigned_at: string | null;
  accepted_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  reached_merchant_skipped: boolean;
  picked_up_actor_type: string | null;
  picked_up_actor_label: string | null;
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
    reached_merchant_skipped: false,
    picked_up_actor_type: null,
    picked_up_actor_label: null,
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
      delivered_at,
      reached_merchant_skipped,
      picked_up_actor_type,
      picked_up_actor_label
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
      status_message,
      metadata
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
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
  }));

  const pickEvent = (type: string) =>
    events.find((e) => e.event_type === type)?.occurred_at ?? null;

  const pickedUpMeta = events.find((e) => e.event_type === "picked_up")?.metadata ?? null;
  const skippedFromEvent = events.some((e) => e.event_type === "reached_merchant_skipped");
  const reachedSkipped =
    Boolean(assignment.reached_merchant_skipped) ||
    skippedFromEvent ||
    Boolean(
      (toIso(assignment.picked_up_at) ?? pickEvent("picked_up")) &&
        !(toIso(assignment.reached_merchant_at) ?? pickEvent("reached_merchant"))
    );

  const actorTypeFromMeta =
    typeof pickedUpMeta?.actor_type === "string" ? pickedUpMeta.actor_type.trim() : null;
  const actorLabelFromMeta =
    typeof pickedUpMeta?.updated_by === "string"
      ? pickedUpMeta.updated_by.trim()
      : typeof pickedUpMeta?.actor_label === "string"
        ? pickedUpMeta.actor_label.trim()
        : null;

  return {
    assigned_at: toIso(assignment.assigned_at) ?? pickEvent("assigned"),
    accepted_at: toIso(assignment.accepted_at) ?? pickEvent("accepted"),
    reached_merchant_at:
      toIso(assignment.reached_merchant_at) ?? pickEvent("reached_merchant"),
    picked_up_at: toIso(assignment.picked_up_at) ?? pickEvent("picked_up"),
    delivered_at: toIso(assignment.delivered_at) ?? pickEvent("delivered"),
    reached_merchant_skipped: reachedSkipped,
    picked_up_actor_type:
      (assignment.picked_up_actor_type as string | null)?.trim() ||
      actorTypeFromMeta ||
      ((toIso(assignment.picked_up_at) ?? pickEvent("picked_up")) ? "rider" : null),
    picked_up_actor_label:
      (assignment.picked_up_actor_label as string | null)?.trim() ||
      actorLabelFromMeta ||
      null,
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
  const key = eventType.trim().replace(/\s+/g, "_").toLowerCase();
  if (key === "reached_merchant_skipped") return "REACHED MX SKIPPED";
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

const CANCELLATION_EVENT_TYPES = new Set(["cancelled", "rejected", "unassigned", "timeout"]);

const RIDER_APP_UPDATED_BY = "Rider: GatiMitra App";
const ADMIN_TEAM_UPDATED_BY = "GatimitraTeam";

function resolveActivityUpdatedBy(
  eventType: string,
  metadata: Record<string, unknown> | null | undefined
): string {
  const meta = metadata ?? {};
  const actorType =
    typeof meta.actor_type === "string" ? meta.actor_type.trim().toLowerCase() : "";
  const adminCancelled = meta.adminCancelled === true;

  if (CANCELLATION_EVENT_TYPES.has(eventType)) {
    if (adminCancelled || actorType === "admin" || actorType === "agent") {
      return ADMIN_TEAM_UPDATED_BY;
    }
    if (actorType === "rider" || meta.riderSelfCancelled === true) {
      return RIDER_APP_UPDATED_BY;
    }
  }

  if (actorType === "rider") {
    return RIDER_APP_UPDATED_BY;
  }

  if (actorType === "admin" || actorType === "agent") {
    return ADMIN_TEAM_UPDATED_BY;
  }

  if (actorType === "system") return "System";

  if (eventType === "reached_merchant_skipped") return "GatiMitra team (skipped)";

  if (
    ["assigned", "accepted", "reached_merchant", "picked_up", "reached_customer", "delivered"].includes(
      eventType
    )
  ) {
    return RIDER_APP_UPDATED_BY;
  }

  const updatedBy = typeof meta.updated_by === "string" ? meta.updated_by.trim() : "";
  if (updatedBy) {
    if (updatedBy.includes("@") && CANCELLATION_EVENT_TYPES.has(eventType)) {
      return ADMIN_TEAM_UPDATED_BY;
    }
    return updatedBy;
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


/** Reason is shown only for cancellations/unassignments or admin/agent actions on the rider bucket. */
function resolveActivityReason(
  eventType: string,
  statusMessage: string | null | undefined,
  cancellationReason: string | null | undefined,
  metadata?: Record<string, unknown> | null
): string | null {
  if (CANCELLATION_EVENT_TYPES.has(eventType)) {
    const meta = metadata ?? {};
    const reasonText =
      typeof meta.reason_text === "string" && meta.reason_text.trim()
        ? meta.reason_text.trim()
        : null;
    const reasonCode =
      typeof meta.reason_code === "string" && meta.reason_code.trim()
        ? meta.reason_code.trim()
        : null;
    return (
      statusMessage?.trim() ||
      cancellationReason?.trim() ||
      reasonText ||
      reasonCode ||
      null
    );
  }
  if (eventType === "reached_merchant_skipped") {
    return statusMessage?.trim() || "Reached store skipped — pickup marked before rider reach";
  }
  if (eventType === "picked_up") {
    const meta = metadata ?? {};
    const actorType =
      typeof meta.actor_type === "string" ? meta.actor_type.trim().toLowerCase() : "";
    const skipped = meta.reached_merchant_skipped === true;
    if (actorType === "agent" || actorType === "admin") {
      const by =
        typeof meta.updated_by === "string" && meta.updated_by.trim()
          ? meta.updated_by.trim()
          : "GatiMitra team";
      return `${statusMessage?.trim() || "Pickup marked by GatiMitra team"}${skipped ? " · reach skipped" : ""} (${by})`;
    }
  }
  return null;
}

function mapTimelineRow(row: TimelineQueryRow): RiderActivityLogRow {
  const status = formatActivityLogStatus(row.eventType);
  const reason = resolveActivityReason(
    row.eventType,
    row.statusMessage,
    row.cancellationReason,
    row.metadata
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

export type OrderReconRiderOption = {
  id: number;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  deliveryProvider: string | null;
};

type ReconRiderAccumulator = OrderReconRiderOption & { sortKey: number };

function upsertReconRider(
  map: Map<number, ReconRiderAccumulator>,
  row: Omit<OrderReconRiderOption, "id"> & { id?: number; sortKey: number }
): void {
  const riderId = row.riderId;
  if (riderId == null || !Number.isFinite(riderId)) return;

  const next: ReconRiderAccumulator = {
    id: row.id ?? riderId,
    riderId,
    riderName: row.riderName?.trim() || null,
    riderMobile: row.riderMobile?.trim() || null,
    deliveryProvider: row.deliveryProvider?.trim() || null,
    sortKey: row.sortKey,
  };

  const prev = map.get(riderId);
  if (!prev) {
    map.set(riderId, next);
    return;
  }

  map.set(riderId, {
    id: Math.max(prev.id, next.id),
    riderId,
    riderName: prev.riderName || next.riderName,
    riderMobile: prev.riderMobile || next.riderMobile,
    deliveryProvider: prev.deliveryProvider || next.deliveryProvider,
    sortKey: Math.max(prev.sortKey, next.sortKey),
  });
}

/**
 * Every distinct rider ever linked to an order (assignments, timeline, dispatch audit).
 * Used by Rider Recon "Select rider" dropdown — not just the current rider on orders_core.
 */
export async function listDistinctOrderRidersForRecon(
  orderId: number
): Promise<OrderReconRiderOption[]> {
  if (!Number.isFinite(orderId)) return [];

  const sql = getSql();
  const byRiderId = new Map<number, ReconRiderAccumulator>();

  const assignments = await listOrderRiderAssignmentsForOrder(orderId);
  for (const assignment of assignments) {
    if (assignment.riderId == null) continue;
    upsertReconRider(byRiderId, {
      id: assignment.id,
      riderId: assignment.riderId,
      riderName: assignment.riderName,
      riderMobile: assignment.riderMobile,
      deliveryProvider: assignment.deliveryProvider,
      sortKey: assignment.id,
    });
  }

  const timelineRows = (await sql`
    SELECT DISTINCT ON (te.rider_id)
      te.rider_id AS "riderId",
      ora.id AS "assignmentId",
      COALESCE(NULLIF(TRIM(ora.rider_name), ''), NULLIF(TRIM(r.name), '')) AS "riderName",
      COALESCE(NULLIF(TRIM(ora.rider_mobile), ''), NULLIF(TRIM(r.mobile), '')) AS "riderMobile",
      COALESCE(
        NULLIF(TRIM(ora.delivery_provider), ''),
        NULLIF(TRIM(ora.assignment_metadata->>'delivery_provider'), ''),
        NULLIF(TRIM(ora.assignment_metadata->>'provider'), ''),
        'internal'
      ) AS "deliveryProvider",
      EXTRACT(EPOCH FROM te.occurred_at)::bigint AS "sortKey"
    FROM order_rider_assignment_timeline_events te
    LEFT JOIN order_rider_assignments ora ON ora.id = te.rider_assignment_id
    LEFT JOIN riders r ON r.id = te.rider_id
    WHERE te.order_core_id = ${orderId}
      AND te.rider_id IS NOT NULL
    ORDER BY te.rider_id, te.occurred_at DESC, te.id DESC
  `) as Array<Record<string, unknown>>;

  for (const row of timelineRows) {
    upsertReconRider(byRiderId, {
      id: Number(row.assignmentId ?? 0) || undefined,
      riderId: Number(row.riderId),
      riderName: (row.riderName as string | null) ?? null,
      riderMobile: (row.riderMobile as string | null) ?? null,
      deliveryProvider: (row.deliveryProvider as string | null) ?? null,
      sortKey: Number(row.sortKey ?? 0),
    });
  }

  try {
    const auditRows = (await sql`
      SELECT DISTINCT ON (a.rider_id)
        a.rider_id AS "riderId",
        COALESCE(NULLIF(TRIM(r.name), ''), NULLIF(TRIM(a.metadata->>'rider_name'), '')) AS "riderName",
        COALESCE(NULLIF(TRIM(r.mobile), ''), NULLIF(TRIM(a.metadata->>'rider_mobile'), '')) AS "riderMobile",
        EXTRACT(EPOCH FROM a.created_at)::bigint AS "sortKey"
      FROM order_rider_dispatch_assignment_audit a
      LEFT JOIN riders r ON r.id = a.rider_id
      WHERE a.order_core_id = ${orderId}
        AND a.rider_id IS NOT NULL
        AND a.event_type IN ('accepted', 'assigned', 'cancelled', 'unassigned', 'rejected')
      ORDER BY a.rider_id, a.created_at DESC, a.id DESC
    `) as Array<Record<string, unknown>>;

    for (const row of auditRows) {
      upsertReconRider(byRiderId, {
        riderId: Number(row.riderId),
        riderName: (row.riderName as string | null) ?? null,
        riderMobile: (row.riderMobile as string | null) ?? null,
        deliveryProvider: "internal",
        sortKey: Number(row.sortKey ?? 0),
      });
    }
  } catch {
    /* audit table optional in some envs */
  }

  return Array.from(byRiderId.values())
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ sortKey: _sortKey, ...rider }) => rider);
}

