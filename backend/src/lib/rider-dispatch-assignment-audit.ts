/**
 * Append-only rider dispatch assignment audit — never update existing rows.
 */

import { getSql } from "../db/client.js";

export type DispatchAssignmentAuditEventType =
  | "offer_sent"
  | "offer_viewed"
  | "accepted"
  | "rejected"
  | "assigned"
  | "unassigned"
  | "timeout"
  | "cancelled"
  | "removed"
  | "eligibility_checked";

export type RecordDispatchAssignmentAuditInput = {
  orderCoreId: number;
  orderId: string;
  riderId: number;
  eventType: DispatchAssignmentAuditEventType;
  assignmentAttemptNumber?: number;
  dispatchSessionId?: number | null;
  waveNumber?: number | null;
  dispatchRadiusMeters?: number | null;
  offerSentAt?: Date | null;
  responseReceivedAt?: Date | null;
  assignedAt?: Date | null;
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
  cancelledAt?: Date | null;
  unassignedAt?: Date | null;
  timeoutAt?: Date | null;
  removedBy?: string | null;
  removalReason?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

async function resolveAssignmentAttemptNumber(
  orderCoreId: number,
  riderId: number
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT assignment_attempt_number
    FROM order_rider_dispatch_assignment_audit
    WHERE order_core_id = ${orderCoreId}
      AND rider_id = ${riderId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ assignment_attempt_number: number }>;
  const attempt = Number(rows[0]?.assignment_attempt_number ?? 0);
  return attempt > 0 ? attempt : 1;
}

async function resolveGlobalDispatchAttemptNumber(orderCoreId: number): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COALESCE(MAX(assignment_attempt_number), 0) AS max_attempt
    FROM order_rider_dispatch_assignment_audit
    WHERE order_core_id = ${orderCoreId}
      AND event_type = 'offer_sent'
  `) as Array<{ max_attempt: number }>;
  return Math.max(1, Number(rows[0]?.max_attempt ?? 0) + 1);
}

/** Insert append-only audit row. */
export async function recordDispatchAssignmentAudit(
  input: RecordDispatchAssignmentAuditInput
): Promise<void> {
  const sql = getSql();
  const now = input.occurredAt ?? new Date();
  const orderId = input.orderId.trim();
  if (!orderId || !Number.isFinite(input.orderCoreId) || !Number.isFinite(input.riderId)) return;

  let attempt = input.assignmentAttemptNumber;
  if (attempt == null || !Number.isFinite(attempt) || attempt < 1) {
    attempt = await resolveAssignmentAttemptNumber(input.orderCoreId, input.riderId);
  }

  await sql`
    INSERT INTO order_rider_dispatch_assignment_audit (
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
    )
    VALUES (
      ${input.orderCoreId},
      ${orderId},
      ${input.riderId},
      ${Math.max(1, Math.round(attempt))},
      ${input.eventType},
      ${input.dispatchSessionId ?? null},
      ${input.waveNumber ?? null},
      ${input.dispatchRadiusMeters ?? null},
      ${input.offerSentAt?.toISOString() ?? null},
      ${input.responseReceivedAt?.toISOString() ?? null},
      ${input.assignedAt?.toISOString() ?? null},
      ${input.acceptedAt?.toISOString() ?? null},
      ${input.rejectedAt?.toISOString() ?? null},
      ${input.cancelledAt?.toISOString() ?? null},
      ${input.unassignedAt?.toISOString() ?? null},
      ${input.timeoutAt?.toISOString() ?? null},
      ${input.removedBy ?? null},
      ${input.removalReason ?? null},
      ${input.actorType ?? null},
      ${input.actorId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${now.toISOString()}::timestamptz
    )
  `;
}

/** Bulk offer_sent rows after dispatch wave notification. */
export async function recordDispatchOffersSent(args: {
  orderCoreId: number;
  orderId: string;
  serviceType: "food" | "parcel" | "person_ride";
  dispatchSessionId: number;
  waveNumber: number;
  dispatchRadiusMeters: number;
  riderIds: number[];
  occurredAt?: Date;
}): Promise<void> {
  const { evaluateAndAuditRiderAssignmentEligibility } = await import(
    "./rider-assignment-control.js"
  );
  const now = args.occurredAt ?? new Date();
  const attempt = await resolveGlobalDispatchAttemptNumber(args.orderCoreId);
  for (const riderId of args.riderIds) {
    const eligibility = await evaluateAndAuditRiderAssignmentEligibility(
      riderId,
      args.serviceType,
      {
        orderCoreId: args.orderCoreId,
        orderId: args.orderId,
        eventContext: "dispatch_offer",
      }
    );
    await recordDispatchAssignmentAudit({
      orderCoreId: args.orderCoreId,
      orderId: args.orderId,
      riderId,
      eventType: "offer_sent",
      assignmentAttemptNumber: attempt,
      dispatchSessionId: args.dispatchSessionId,
      waveNumber: args.waveNumber,
      dispatchRadiusMeters: args.dispatchRadiusMeters,
      offerSentAt: now,
      actorType: "system",
      actorId: "dispatch_engine",
      occurredAt: now,
      metadata: {
        activeFoodOrders: eligibility.counts.food,
        activeParcelOrders: eligibility.counts.parcel,
        activePersonRides: eligibility.counts.person_ride,
        assignmentLimitUsed: eligibility.assignmentLimitUsed,
        crossServiceRuleApplied: eligibility.crossServiceRuleApplied,
        personRideExclusiveApplied: eligibility.personRideExclusiveApplied,
        eligibilityResult: eligibility.eligible ? "eligible" : "blocked",
        blockReason: eligibility.blockReason,
      },
    });
  }
}
