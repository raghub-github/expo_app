/**
 * Append-only rider dispatch assignment audit — never update existing rows.
 */

import { getSql } from "../db/client.js";
import { publishRiderEvent } from "../modules/realtime/publish.js";

export const TERMINAL_DISPATCH_OFFER_EVENTS = [
  "accepted",
  "rejected",
  "timeout",
  "cancelled",
  "assigned",
] as const;

export function isTerminalDispatchOfferEvent(eventType: string): boolean {
  return (TERMINAL_DISPATCH_OFFER_EVENTS as readonly string[]).includes(eventType);
}

export const ORDER_ASSIGNED_TO_OTHER_RIDER = "ORDER_ASSIGNED_TO_OTHER_RIDER";

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
      ${JSON.stringify(input.metadata ?? {})}::text::jsonb,
      ${now.toISOString()}::timestamptz
    )
  `;

  await syncRiderDispatchOfferStats(input.riderId, input.eventType, now).catch((err) => {
    console.warn("[recordDispatchAssignmentAudit] offer stats sync failed:", err);
  });
}

async function syncRiderDispatchOfferStats(
  riderId: number,
  eventType: DispatchAssignmentAuditEventType,
  occurredAt: Date
): Promise<void> {
  const offered = eventType === "offer_sent" ? 1 : 0;
  const accepted = eventType === "accepted" ? 1 : 0;
  const rejected = eventType === "rejected" ? 1 : 0;
  const missed = eventType === "timeout" ? 1 : 0;
  if (offered + accepted + rejected + missed === 0) return;

  const sql = getSql();
  await sql`
    INSERT INTO rider_dispatch_offer_stats (
      rider_id,
      offers_total,
      offers_accepted,
      offers_rejected,
      offers_missed,
      last_offer_at,
      last_accepted_at,
      updated_at
    )
    VALUES (
      ${riderId},
      ${offered},
      ${accepted},
      ${rejected},
      ${missed},
      ${offered ? occurredAt.toISOString() : null}::timestamptz,
      ${accepted ? occurredAt.toISOString() : null}::timestamptz,
      NOW()
    )
    ON CONFLICT (rider_id) DO UPDATE SET
      offers_total = rider_dispatch_offer_stats.offers_total + ${offered},
      offers_accepted = rider_dispatch_offer_stats.offers_accepted + ${accepted},
      offers_rejected = rider_dispatch_offer_stats.offers_rejected + ${rejected},
      offers_missed = rider_dispatch_offer_stats.offers_missed + ${missed},
      last_offer_at = CASE
        WHEN ${offered} > 0 THEN GREATEST(
          COALESCE(rider_dispatch_offer_stats.last_offer_at, '-infinity'::timestamptz),
          ${occurredAt.toISOString()}::timestamptz
        )
        ELSE rider_dispatch_offer_stats.last_offer_at
      END,
      last_accepted_at = CASE
        WHEN ${accepted} > 0 THEN GREATEST(
          COALESCE(rider_dispatch_offer_stats.last_accepted_at, '-infinity'::timestamptz),
          ${occurredAt.toISOString()}::timestamptz
        )
        ELSE rider_dispatch_offer_stats.last_accepted_at
      END,
      updated_at = NOW()
  `;
}

type PendingOfferRow = {
  rider_id: number;
  assignment_attempt_number: number;
  order_id: string;
  wave_number: number | null;
  dispatch_session_id: number | null;
  metadata: Record<string, unknown>;
};

/** Riders who received offer_sent but have no accept/reject/timeout outcome yet. */
export async function listPendingDispatchOffersForOrder(
  orderCoreId: number,
  excludeRiderId?: number | null
): Promise<PendingOfferRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT DISTINCT ON (a.rider_id, a.assignment_attempt_number)
      a.rider_id,
      a.assignment_attempt_number,
      a.order_id,
      a.wave_number,
      a.dispatch_session_id,
      a.metadata
    FROM order_rider_dispatch_assignment_audit a
    WHERE a.order_core_id = ${orderCoreId}
      AND a.event_type = 'offer_sent'
      AND (${excludeRiderId ?? null}::bigint IS NULL OR a.rider_id <> ${excludeRiderId ?? null})
      AND NOT EXISTS (
        SELECT 1
        FROM order_rider_dispatch_assignment_audit o
        WHERE o.order_core_id = a.order_core_id
          AND o.rider_id = a.rider_id
          AND o.assignment_attempt_number = a.assignment_attempt_number
          AND o.event_type IN ('accepted', 'rejected', 'timeout', 'cancelled', 'assigned')
      )
    ORDER BY a.rider_id, a.assignment_attempt_number, a.created_at DESC
  `) as Array<Record<string, unknown>>;

  return (rows ?? []).map((r) => ({
    rider_id: Number(r.rider_id),
    assignment_attempt_number: Number(r.assignment_attempt_number),
    order_id: String(r.order_id),
    wave_number: r.wave_number != null ? Number(r.wave_number) : null,
    dispatch_session_id: r.dispatch_session_id != null ? Number(r.dispatch_session_id) : null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}

/** Mark all pending offers on an order as missed (timeout) — idempotent per rider+attempt. */
export async function recordPendingDispatchOffersMissed(input: {
  orderCoreId: number;
  excludeRiderId?: number | null;
  reason: string;
  missSource?: string;
  occurredAt?: Date;
}): Promise<number> {
  const pending = await listPendingDispatchOffersForOrder(
    input.orderCoreId,
    input.excludeRiderId ?? null
  );
  if (pending.length === 0) return 0;

  const now = input.occurredAt ?? new Date();
  for (const row of pending) {
    await recordDispatchAssignmentAudit({
      orderCoreId: input.orderCoreId,
      orderId: row.order_id,
      riderId: row.rider_id,
      eventType: "timeout",
      assignmentAttemptNumber: row.assignment_attempt_number,
      dispatchSessionId: row.dispatch_session_id,
      waveNumber: row.wave_number,
      timeoutAt: now,
      responseReceivedAt: now,
      actorType: "system",
      actorId: input.missSource ?? "dispatch_engine",
      metadata: {
        missReason: input.reason,
        serviceType: row.metadata?.serviceType ?? null,
      },
      occurredAt: now,
    });

    const offerId = row.order_id;
    // Always push a cancel frame so open incoming modals close instantly —
    // customer cancel / dispatch expire previously only wrote audit rows.
    if (input.reason === "order_accepted_by_other_rider") {
      await publishRiderEvent(row.rider_id, {
        type: "dispatch_offer_withdrawn",
        reason: "accepted_by_other_rider",
        orderId: offerId,
        order_id: offerId,
        offerId,
        offer_id: offerId,
      });
    } else {
      const cancelReason =
        input.reason === "dispatch_cancelled"
          ? "order_cancelled"
          : input.reason === "dispatch_expired"
            ? "dispatch_expired"
            : input.reason;
      await publishRiderEvent(row.rider_id, {
        type: "dispatch_offer_cancelled",
        reason: cancelReason,
        orderId: offerId,
        order_id: offerId,
        offerId,
        offer_id: offerId,
      });
      await publishRiderEvent(row.rider_id, {
        type: "dispatch_offer_withdrawn",
        reason: cancelReason,
        orderId: offerId,
        order_id: offerId,
        offerId,
        offer_id: offerId,
      });
    }
  }
  return pending.length;
}

/** Cancel every still-pending offer after another rider claimed the order. */
export async function cancelLosingDispatchOffers(input: {
  orderCoreId: number;
  winnerRiderId: number;
  orderId: string;
  occurredAt?: Date;
}): Promise<number> {
  const pending = await listPendingDispatchOffersForOrder(
    input.orderCoreId,
    input.winnerRiderId
  );
  if (pending.length === 0) return 0;

  const now = input.occurredAt ?? new Date();
  const orderId = input.orderId.trim();
  for (const row of pending) {
    await recordDispatchAssignmentAudit({
      orderCoreId: input.orderCoreId,
      orderId: row.order_id || orderId,
      riderId: row.rider_id,
      eventType: "cancelled",
      assignmentAttemptNumber: row.assignment_attempt_number,
      dispatchSessionId: row.dispatch_session_id,
      waveNumber: row.wave_number,
      cancelledAt: now,
      responseReceivedAt: now,
      removalReason: ORDER_ASSIGNED_TO_OTHER_RIDER,
      actorType: "system",
      actorId: "dispatch_accept",
      metadata: {
        missReason: ORDER_ASSIGNED_TO_OTHER_RIDER,
        assignedRiderId: input.winnerRiderId,
        serviceType: row.metadata?.serviceType ?? null,
      },
      occurredAt: now,
    });

    const offerId = row.order_id || orderId;
    await publishRiderEvent(row.rider_id, {
      type: "dispatch_offer_cancelled",
      order_id: offerId,
      offer_id: offerId,
      orderId: offerId,
      offerId,
      reason: ORDER_ASSIGNED_TO_OTHER_RIDER,
      assigned_rider_id: input.winnerRiderId,
      assignedRiderId: input.winnerRiderId,
    });
    await publishRiderEvent(row.rider_id, {
      type: "dispatch_offer_withdrawn",
      reason: "accepted_by_other_rider",
      orderId: offerId,
    });
    console.info(
      "[dispatch] OFFER_CANCEL_EVENT",
      JSON.stringify({
        order: offerId,
        offer: offerId,
        rider: row.rider_id,
        winner: input.winnerRiderId,
      })
    );
  }
  return pending.length;
}

export type RiderDispatchOfferStats = {
  riderId: number;
  offersTotal: number;
  offersAccepted: number;
  offersRejected: number;
  offersMissed: number;
  acceptRate: number | null;
  lastOfferAt: string | null;
  lastAcceptedAt: string | null;
};

export async function getRiderDispatchOfferStats(riderId: number): Promise<RiderDispatchOfferStats> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      rider_id,
      offers_total,
      offers_accepted,
      offers_rejected,
      offers_missed,
      last_offer_at,
      last_accepted_at
    FROM rider_dispatch_offer_stats
    WHERE rider_id = ${riderId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;

  const row = rows[0];
  const offersTotal = Number(row?.offers_total ?? 0);
  const offersAccepted = Number(row?.offers_accepted ?? 0);
  const offersRejected = Number(row?.offers_rejected ?? 0);
  const offersMissed = Number(row?.offers_missed ?? 0);
  const acceptRate =
    offersTotal > 0 ? Math.round((offersAccepted / offersTotal) * 1000) / 10 : null;

  return {
    riderId,
    offersTotal,
    offersAccepted,
    offersRejected,
    offersMissed,
    acceptRate,
    lastOfferAt: row?.last_offer_at != null ? String(row.last_offer_at) : null,
    lastAcceptedAt: row?.last_accepted_at != null ? String(row.last_accepted_at) : null,
  };
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
  const { isOrderStillDispatchable } = await import("./order-dispatch.service.js");
  const stillOpen = await isOrderStillDispatchable(args.orderCoreId);
  if (!stillOpen) {
    console.info(
      "[dispatch] WAVE_STOPPED",
      JSON.stringify({
        order: args.orderId,
        reason: "ORDER_ASSIGNED",
      })
    );
    return;
  }

  await Promise.all(
    args.riderIds.map(async (riderId) => {
      try {
        if (!(await isOrderStillDispatchable(args.orderCoreId))) {
          return;
        }
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
        console.info(
          "[dispatch] OFFER_CREATED",
          JSON.stringify({
            order: args.orderId,
            offer: args.orderId,
            rider: riderId,
          })
        );
      } catch (err) {
        console.warn(
          "[dispatch] OFFER_CREATED failed (other riders still notified)",
          JSON.stringify({
            order: args.orderId,
            rider: riderId,
            message: err instanceof Error ? err.message : String(err),
          })
        );
      }
    })
  );
}
