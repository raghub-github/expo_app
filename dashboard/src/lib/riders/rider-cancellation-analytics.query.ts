/**
 * Rider-scoped cancellation-analytics aggregation (authoritative backend query).
 *
 * Unit of counting = one unique rider-accepted order (spec §24). The spine is
 * order_rider_assignments — the per-rider assignment ledger — because a rider's own
 * cancellation of an accepted order does NOT terminally cancel orders_core (the order
 * is unassigned and re-dispatched), so orders_core.status alone misses rider self-cancels.
 *
 * A rider-accepted order (accepted_at NOT NULL) is "cancelled after acceptance" for the
 * rider when, taking the rider's best leg on that order:
 *   - the assignment leg itself was cancelled  (rider self-cancel OR admin removed the rider
 *     — both set assignment_status='cancelled'), OR
 *   - the order was terminally cancelled/failed while the rider still held the leg
 *     (assignment_status not unassigned/rejected).
 * A leg the rider ultimately delivered is never counted as cancelled (re-accept-and-deliver).
 *
 * Responsibility (spec §5/§21) comes from the EXISTING business taxonomy
 * order_cancellation_reason_catalog.attribute (RIDER => rider fault), resolved from:
 *   - assignment-level cancels: order_rider_dispatch_exclusions.reason_code (rider self / admin),
 *   - terminal cancels: order_cancellation_reasons.attribute (snapshot) / reason_code / cancelled_by.
 * Rider fault is only counted when the reason is rider-attributed — never guessed.
 *
 * Reporting window is anchored on accepted_at (§16); every filter is scoped to rider_id (§17).
 */

import { getSql } from "@/lib/db/client";
import { resolveLegResponsibility } from "@/lib/riders/cancellation-responsibility";
import type {
  AcceptedCountRow,
  CancellationCountRow,
  PickupStage,
} from "@/lib/riders/rider-cancellation-analytics";

export const RIDER_ANALYTICS_SERVICES = ["food", "parcel", "person_ride"] as const;

type AcceptedOrderRow = {
  order_core_id: string | number;
  service: string;
  is_cancelled: boolean;
  picked_up: boolean;
  exclusion_source: string | null;
  exclusion_attribute: string | null;
  terminal_attribute: string | null;
  cancelled_by: string | null;
};

export type RiderCancellationAggregation = {
  accepted: AcceptedCountRow[];
  cancellations: CancellationCountRow[];
  unknownServiceOrders: number;
};

export async function aggregateRiderCancellationCounts(input: {
  riderId: number;
  from?: string | null;
  to?: string | null;
}): Promise<RiderCancellationAggregation> {
  const sql = getSql();
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;

  // One row per unique accepted order for this rider. DISTINCT ON keeps the rider's
  // "best" leg for that order (delivered wins over cancelled wins over active), so a
  // re-accept-and-deliver is never miscounted as a cancellation (§24).
  const rows = (await sql`
    SELECT DISTINCT ON (ora.order_core_id)
      ora.order_core_id,
      oc.order_type::text AS service,
      (
        ora.assignment_status::text = 'cancelled'
        OR (
          oc.status::text IN ('cancelled', 'failed')
          AND ora.assignment_status::text NOT IN ('unassigned', 'rejected', 'completed')
        )
      ) AS is_cancelled,
      (
        COALESCE(ora.picked_up_at, oc.rider_picked_up_at, oc.actual_pickup_time) IS NOT NULL
      ) AS picked_up,
      ex.exclusion_source,
      cat_ex.attribute AS exclusion_attribute,
      COALESCE(ocr.attribute, cat_ocr.attribute) AS terminal_attribute,
      COALESCE(ocr.cancelled_by, oc.cancelled_by) AS cancelled_by
    FROM order_rider_assignments ora
    INNER JOIN orders_core oc
      ON oc.id = ora.order_core_id
    LEFT JOIN order_rider_dispatch_exclusions ex
      ON ex.order_core_id = ora.order_core_id
     AND ex.rider_id = ora.rider_id
    LEFT JOIN order_cancellation_reason_catalog cat_ex
      ON cat_ex.reason_code = ex.reason_code
    LEFT JOIN LATERAL (
      SELECT r.attribute, r.reason_code, r.cancelled_by
      FROM order_cancellation_reasons r
      WHERE r.order_id = oc.id
      ORDER BY r.created_at DESC
      LIMIT 1
    ) ocr ON TRUE
    LEFT JOIN order_cancellation_reason_catalog cat_ocr
      ON cat_ocr.reason_code = ocr.reason_code
    WHERE ora.rider_id = ${input.riderId}
      AND ora.accepted_at IS NOT NULL
      AND oc.order_type IN ('food', 'parcel', 'person_ride')
      AND (${from}::timestamptz IS NULL OR ora.accepted_at >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR ora.accepted_at <= ${to}::timestamptz)
    ORDER BY
      ora.order_core_id,
      -- Best leg first: delivered (0) < cancelled (1) < other (2).
      CASE
        WHEN ora.assignment_status::text = 'completed' OR ora.delivered_at IS NOT NULL THEN 0
        WHEN ora.assignment_status::text = 'cancelled'
          OR (oc.status::text IN ('cancelled', 'failed')
              AND ora.assignment_status::text NOT IN ('unassigned', 'rejected', 'completed')) THEN 1
        ELSE 2
      END ASC,
      ora.accepted_at DESC NULLS LAST
  `) as unknown as AcceptedOrderRow[];

  const acceptedByService = new Map<string, number>();
  const cancelBuckets = new Map<string, CancellationCountRow>();
  let unknownServiceOrders = 0;

  for (const row of rows) {
    const service = String(row.service ?? "").trim();
    if (!service) continue;
    if (!RIDER_ANALYTICS_SERVICES.includes(service as (typeof RIDER_ANALYTICS_SERVICES)[number])) {
      unknownServiceOrders += 1;
    }
    acceptedByService.set(service, (acceptedByService.get(service) ?? 0) + 1);

    if (!row.is_cancelled) continue;

    const stage: PickupStage = row.picked_up ? "POST_PICKUP" : "PRE_PICKUP";

    const responsibility = resolveLegResponsibility({
      exclusionSource: row.exclusion_source,
      exclusionAttribute: row.exclusion_attribute,
      terminalAttribute: row.terminal_attribute,
      cancelledBy: row.cancelled_by,
    });

    const key = `${service}|${stage}|${responsibility}`;
    const existing = cancelBuckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      cancelBuckets.set(key, { service, stage, responsibility, count: 1 });
    }
  }

  return {
    accepted: [...acceptedByService.entries()].map(([service, accepted]) => ({ service, accepted })),
    cancellations: [...cancelBuckets.values()],
    unknownServiceOrders,
  };
}
