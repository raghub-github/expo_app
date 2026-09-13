/**
 * Per-service accepted + rider-fault cancellation counts for one rider (auto-block input).
 *
 * Same authoritative model as the dashboard analytics: order_rider_assignments is the spine
 * (proves acceptance, captures rider self-cancels that re-dispatch), and responsibility comes
 * from the existing reason taxonomy. Lifetime figures — the auto-block is a lifetime rule
 * whose only release is an admin threshold change.
 */

import { getSql } from "../db/client.js";
import { resolveLegResponsibility } from "./cancellation-responsibility.js";

export type ServiceFaultStats = { accepted: number; riderFault: number; cancelled: number };
export type RiderFaultStatsByService = Record<string, ServiceFaultStats>;

export const AUTO_BLOCK_SERVICES = ["food", "parcel", "person_ride"] as const;
export type AutoBlockService = (typeof AUTO_BLOCK_SERVICES)[number];

type LegRow = {
  service: string;
  is_cancelled: boolean;
  exclusion_source: string | null;
  exclusion_attribute: string | null;
  terminal_attribute: string | null;
  cancelled_by: string | null;
};

function emptyStats(): ServiceFaultStats {
  return { accepted: 0, riderFault: 0, cancelled: 0 };
}

/** Accepted + rider-fault + cancelled counts per service for one rider (lifetime). */
export async function getRiderFaultStatsByService(
  riderId: number
): Promise<RiderFaultStatsByService> {
  const sql = getSql();
  const rows = (await sql`
    SELECT DISTINCT ON (ora.order_core_id)
      oc.order_type::text AS service,
      (ora.assignment_status::text = 'cancelled'
       OR (oc.status::text IN ('cancelled','failed')
           AND ora.assignment_status::text NOT IN ('unassigned','rejected','completed'))) AS is_cancelled,
      ex.exclusion_source,
      cat_ex.attribute AS exclusion_attribute,
      COALESCE(ocr.attribute, cat_ocr.attribute) AS terminal_attribute,
      COALESCE(ocr.cancelled_by, oc.cancelled_by) AS cancelled_by
    FROM order_rider_assignments ora
    INNER JOIN orders_core oc ON oc.id = ora.order_core_id
    LEFT JOIN order_rider_dispatch_exclusions ex
      ON ex.order_core_id = ora.order_core_id AND ex.rider_id = ora.rider_id
    LEFT JOIN order_cancellation_reason_catalog cat_ex ON cat_ex.reason_code = ex.reason_code
    LEFT JOIN LATERAL (
      SELECT r.attribute, r.reason_code, r.cancelled_by FROM order_cancellation_reasons r
      WHERE r.order_id = oc.id ORDER BY r.created_at DESC LIMIT 1
    ) ocr ON TRUE
    LEFT JOIN order_cancellation_reason_catalog cat_ocr ON cat_ocr.reason_code = ocr.reason_code
    WHERE ora.rider_id = ${riderId}
      AND ora.accepted_at IS NOT NULL
      AND oc.order_type IN ('food','parcel','person_ride')
    ORDER BY ora.order_core_id,
      CASE
        WHEN ora.assignment_status::text = 'completed' OR ora.delivered_at IS NOT NULL THEN 0
        WHEN ora.assignment_status::text = 'cancelled'
          OR (oc.status::text IN ('cancelled','failed')
              AND ora.assignment_status::text NOT IN ('unassigned','rejected','completed')) THEN 1
        ELSE 2 END ASC,
      ora.accepted_at DESC NULLS LAST
  `) as unknown as LegRow[];

  const out: RiderFaultStatsByService = {};
  for (const svc of AUTO_BLOCK_SERVICES) out[svc] = emptyStats();

  for (const row of rows) {
    const service = String(row.service ?? "").trim();
    if (!service) continue;
    const stats = (out[service] ??= emptyStats());
    stats.accepted += 1;
    if (!row.is_cancelled) continue;
    stats.cancelled += 1;
    const responsibility = resolveLegResponsibility({
      exclusionSource: row.exclusion_source,
      exclusionAttribute: row.exclusion_attribute,
      terminalAttribute: row.terminal_attribute,
      cancelledBy: row.cancelled_by,
    });
    if (responsibility === "RIDER_FAULT") stats.riderFault += 1;
  }

  return out;
}

/**
 * Riders eligible to be (re)evaluated for a service by the reconciler: anyone with at least
 * one rider-fault cancelled leg for the service (only they can ever cross a threshold), plus
 * anyone currently blocked (so raising the threshold can release them).
 */
export async function getRidersWithServiceCancellations(
  service: AutoBlockService,
  limit = 5000
): Promise<number[]> {
  const sql = getSql();
  const rows = (await sql`
    WITH legs AS (
      SELECT DISTINCT ON (ora.rider_id, ora.order_core_id)
        ora.rider_id,
        (ora.assignment_status::text = 'cancelled'
         OR (oc.status::text IN ('cancelled','failed')
             AND ora.assignment_status::text NOT IN ('unassigned','rejected','completed'))) AS is_cancelled,
        ex.exclusion_source,
        cat_ex.attribute AS exclusion_attribute,
        COALESCE(ocr.attribute, cat_ocr.attribute) AS terminal_attribute,
        COALESCE(ocr.cancelled_by, oc.cancelled_by) AS cancelled_by
      FROM order_rider_assignments ora
      INNER JOIN orders_core oc ON oc.id = ora.order_core_id
      LEFT JOIN order_rider_dispatch_exclusions ex
        ON ex.order_core_id = ora.order_core_id AND ex.rider_id = ora.rider_id
      LEFT JOIN order_cancellation_reason_catalog cat_ex ON cat_ex.reason_code = ex.reason_code
      LEFT JOIN LATERAL (
        SELECT r.attribute, r.reason_code, r.cancelled_by FROM order_cancellation_reasons r
        WHERE r.order_id = oc.id ORDER BY r.created_at DESC LIMIT 1
      ) ocr ON TRUE
      LEFT JOIN order_cancellation_reason_catalog cat_ocr ON cat_ocr.reason_code = ocr.reason_code
      WHERE ora.accepted_at IS NOT NULL
        AND oc.order_type = ${service}
      ORDER BY ora.rider_id, ora.order_core_id,
        CASE
          WHEN ora.assignment_status::text = 'completed' OR ora.delivered_at IS NOT NULL THEN 0
          WHEN ora.assignment_status::text = 'cancelled'
            OR (oc.status::text IN ('cancelled','failed')
                AND ora.assignment_status::text NOT IN ('unassigned','rejected','completed')) THEN 1
          ELSE 2 END ASC,
        ora.accepted_at DESC NULLS LAST
    )
    SELECT DISTINCT rider_id FROM legs WHERE is_cancelled
    UNION
    SELECT rider_id FROM rider_cancellation_service_blocks WHERE service_type = ${service}
    LIMIT ${limit}
  `) as unknown as { rider_id: number }[];
  return rows.map((r) => Number(r.rider_id)).filter((n) => Number.isFinite(n) && n > 0);
}
