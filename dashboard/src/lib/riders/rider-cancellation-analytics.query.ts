/**
 * Rider-scoped cancellation-analytics aggregation (authoritative backend query).
 *
 * Unit of counting = one unique rider-accepted order (spec §24). Source of truth:
 *   - order_rider_assignments: proves the rider ACCEPTED (accepted_at IS NOT NULL) — the
 *     denominator (§22); per-rider so a re-offer to other riders is never counted here (§23).
 *   - orders_core: terminal status / cancelled_at / cancelled_by, and pickup lifecycle.
 *   - order_cancellation_reasons + order_cancellation_reason_catalog: reason_code → attribute
 *     (the existing business responsibility classification; §5/§21).
 *
 * Attribution: a cancellation is counted for this rider only when the rider currently owns
 * the order (orders_core.rider_id = rider) AND the order is terminally cancelled AND it was
 * cancelled at/after the rider accepted. Reporting window is anchored on accepted_at (§16).
 *
 * Responsibility is resolved in TS (single mapping layer) from the catalog attribute + raw
 * actor returned here — never guessed in SQL.
 */

import { getSql } from "@/lib/db/client";
import {
  resolveCancellationResponsibility,
} from "@/lib/riders/cancellation-responsibility";
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
  catalog_attribute: string | null;
  cancelled_by: string | null;
};

export type RiderCancellationAggregation = {
  accepted: AcceptedCountRow[];
  cancellations: CancellationCountRow[];
  /** Orders that fell into a service outside the known list (audit only). */
  unknownServiceOrders: number;
};

/**
 * Returns per-service accepted totals + per (service, stage, responsibility) cancellation
 * counts for one rider, ready to feed computeRiderCancellationAnalytics().
 */
export async function aggregateRiderCancellationCounts(input: {
  riderId: number;
  from?: string | null;
  to?: string | null;
}): Promise<RiderCancellationAggregation> {
  const sql = getSql();
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;

  // One row per unique accepted order owned by this rider. DISTINCT ON dedups any
  // duplicate assignment rows for the same order (§24), keeping the latest acceptance.
  const rows = (await sql`
    SELECT DISTINCT ON (oc.id)
      oc.id AS order_core_id,
      oc.order_type::text AS service,
      (oc.status::text = 'cancelled' AND oc.cancelled_at IS NOT NULL) AS is_cancelled,
      (
        COALESCE(ora.picked_up_at, oc.rider_picked_up_at, oc.actual_pickup_time) IS NOT NULL
      ) AS picked_up,
      cat.attribute AS catalog_attribute,
      oc.cancelled_by AS cancelled_by
    FROM order_rider_assignments ora
    INNER JOIN orders_core oc
      ON oc.id = ora.order_core_id
    LEFT JOIN LATERAL (
      SELECT ocr.reason_code, ocr.cancelled_by
      FROM order_cancellation_reasons ocr
      WHERE ocr.order_id = oc.id
      ORDER BY ocr.created_at DESC
      LIMIT 1
    ) ocr ON TRUE
    LEFT JOIN order_cancellation_reason_catalog cat
      ON cat.reason_code = ocr.reason_code
    WHERE ora.rider_id = ${input.riderId}
      AND ora.accepted_at IS NOT NULL
      AND oc.rider_id = ${input.riderId}
      AND oc.order_type IN ('food', 'parcel', 'person_ride')
      AND (${from}::timestamptz IS NULL OR ora.accepted_at >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR ora.accepted_at <= ${to}::timestamptz)
      AND (
        oc.status::text <> 'cancelled'
        OR oc.cancelled_at IS NULL
        OR oc.cancelled_at >= ora.accepted_at
      )
    ORDER BY oc.id, ora.accepted_at DESC NULLS LAST
  `) as unknown as AcceptedOrderRow[];

  const acceptedByService = new Map<string, number>();
  // key: `${service}|${stage}|${responsibility}` -> count
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
    const responsibility = resolveCancellationResponsibility({
      catalogAttribute: row.catalog_attribute,
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
