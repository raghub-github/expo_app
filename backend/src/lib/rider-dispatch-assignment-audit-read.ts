/**
 * Read rider dispatch assignment audit timeline for an order.
 */

import { getSql } from "../db/client.js";

export type DispatchAssignmentAuditRow = {
  id: number;
  orderCoreId: number;
  orderId: string;
  riderId: number;
  assignmentAttemptNumber: number;
  eventType: string;
  dispatchSessionId: number | null;
  waveNumber: number | null;
  dispatchRadiusMeters: number | null;
  offerSentAt: string | null;
  responseReceivedAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  unassignedAt: string | null;
  timeoutAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
  actorType: string | null;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** Riders who rejected or timed out on dispatch offers for this order. */
export async function countDispatchDeclinedForOrder(orderRef: string): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(DISTINCT rider_id)::int AS declined_count
    FROM order_rider_dispatch_assignment_audit
    WHERE order_id = ${orderRef.trim()}
      AND event_type IN ('rejected', 'timeout')
  `) as Array<{ declined_count?: number | null }>;

  return Math.max(0, Number(rows[0]?.declined_count ?? 0));
}

export async function listDispatchAssignmentAuditForOrder(
  orderRef: string
): Promise<DispatchAssignmentAuditRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      id,
      order_core_id,
      order_id,
      rider_id,
      assignment_attempt_number,
      event_type,
      dispatch_session_id,
      wave_number,
      dispatch_radius_meters,
      offer_sent_at,
      response_received_at,
      assigned_at,
      accepted_at,
      rejected_at,
      cancelled_at,
      unassigned_at,
      timeout_at,
      removed_by,
      removal_reason,
      actor_type,
      actor_id,
      metadata,
      created_at
    FROM order_rider_dispatch_assignment_audit
    WHERE order_id = ${orderRef.trim()}
    ORDER BY created_at ASC, id ASC
  `) as Array<Record<string, unknown>>;

  return (rows ?? []).map((r) => ({
    id: Number(r.id),
    orderCoreId: Number(r.order_core_id),
    orderId: String(r.order_id),
    riderId: Number(r.rider_id),
    assignmentAttemptNumber: Number(r.assignment_attempt_number),
    eventType: String(r.event_type),
    dispatchSessionId: r.dispatch_session_id != null ? Number(r.dispatch_session_id) : null,
    waveNumber: r.wave_number != null ? Number(r.wave_number) : null,
    dispatchRadiusMeters:
      r.dispatch_radius_meters != null ? Number(r.dispatch_radius_meters) : null,
    offerSentAt: r.offer_sent_at != null ? String(r.offer_sent_at) : null,
    responseReceivedAt: r.response_received_at != null ? String(r.response_received_at) : null,
    assignedAt: r.assigned_at != null ? String(r.assigned_at) : null,
    acceptedAt: r.accepted_at != null ? String(r.accepted_at) : null,
    rejectedAt: r.rejected_at != null ? String(r.rejected_at) : null,
    cancelledAt: r.cancelled_at != null ? String(r.cancelled_at) : null,
    unassignedAt: r.unassigned_at != null ? String(r.unassigned_at) : null,
    timeoutAt: r.timeout_at != null ? String(r.timeout_at) : null,
    removedBy: r.removed_by != null ? String(r.removed_by) : null,
    removalReason: r.removal_reason != null ? String(r.removal_reason) : null,
    actorType: r.actor_type != null ? String(r.actor_type) : null,
    actorId: r.actor_id != null ? String(r.actor_id) : null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at),
  }));
}
