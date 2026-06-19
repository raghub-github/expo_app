import { getSql } from "../db/client.js";

export type RiderAppCancellationReasonRow = {
  id: number;
  attribute: string;
  label: string;
  reasonCode: string;
  sortOrder: number;
  serviceType: string | null;
};

const APP_ATTRIBUTES = ["RIDER", "CUSTOMER", "MERCHANT"] as const;

function normalizeServiceType(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  if (!v || v === "all") return null;
  if (v === "ride" || v === "person") return "person_ride";
  if (v === "food" || v === "person_ride" || v === "parcel") return v;
  return null;
}

/** Active app-channel cancellation reasons for rider cancel bottom sheet. */
export async function listRiderAppCancellationReasons(args?: {
  serviceType?: string | null;
}): Promise<RiderAppCancellationReasonRow[]> {
  const serviceType = normalizeServiceType(args?.serviceType ?? null);
  const sql = getSql();

  try {
    return await sql<RiderAppCancellationReasonRow[]>`
      SELECT
        id,
        attribute,
        label,
        reason_code AS "reasonCode",
        sort_order AS "sortOrder",
        service_type AS "serviceType"
      FROM order_cancellation_reason_catalog
      WHERE channel = 'app'
        AND is_active = TRUE
        AND attribute = ANY(${APP_ATTRIBUTES})
        AND (
          service_type IS NULL
          OR ${serviceType}::text IS NULL
          OR service_type = ${serviceType}
        )
      ORDER BY
        CASE attribute
          WHEN 'RIDER' THEN 1
          WHEN 'CUSTOMER' THEN 2
          WHEN 'MERCHANT' THEN 3
          ELSE 4
        END,
        sort_order ASC,
        id ASC
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/column .*channel.* does not exist/i.test(msg)) throw e;
  }

  return sql<RiderAppCancellationReasonRow[]>`
    SELECT
      id,
      attribute,
      label,
      reason_code AS "reasonCode",
      sort_order AS "sortOrder",
      NULL::text AS "serviceType"
    FROM order_cancellation_reason_catalog
    WHERE is_active = TRUE
      AND upper(trim(attribute)) = 'RIDER'
      AND (
        ${serviceType}::text IS NULL
        OR TRUE
      )
    ORDER BY sort_order ASC, id ASC
  `;
}
