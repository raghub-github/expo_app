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

function mapRow(row: {
  id: number | string;
  attribute: string;
  label: string;
  reasonCode: string;
  sortOrder: number | string;
  serviceType: string | null;
}): RiderAppCancellationReasonRow {
  const rawService = row.serviceType?.trim() ? row.serviceType.trim() : null;
  return {
    id: Number(row.id),
    attribute: String(row.attribute ?? "").trim(),
    label: String(row.label ?? "").trim(),
    reasonCode: String(row.reasonCode ?? "").trim(),
    sortOrder: Number(row.sortOrder) || 0,
    serviceType: normalizeServiceType(rawService) ?? rawService,
  };
}

/**
 * Universal (service_type NULL / All) + matching service-type rows.
 * Never include other services (e.g. food reasons on a ride cancel).
 */
function pickReasonsForService(
  rows: RiderAppCancellationReasonRow[],
  serviceType: string | null
): RiderAppCancellationReasonRow[] {
  const filtered = serviceType
    ? rows.filter((r) => {
        const st = normalizeServiceType(r.serviceType);
        return st == null || st === serviceType;
      })
    : rows.filter((r) => normalizeServiceType(r.serviceType) == null);

  return filtered.sort((a, b) => {
    const aAll = normalizeServiceType(a.serviceType) == null ? 0 : 1;
    const bAll = normalizeServiceType(b.serviceType) == null ? 0 : 1;
    if (aAll !== bAll) return aAll - bAll;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id - b.id;
  });
}

/** Active app-channel cancellation reasons for rider cancel bottom sheet. */
export async function listRiderAppCancellationReasons(args?: {
  serviceType?: string | null;
}): Promise<RiderAppCancellationReasonRow[]> {
  const serviceType = normalizeServiceType(args?.serviceType ?? null);
  const sql = getSql();

  try {
    const raw = await sql<
      {
        id: number | string;
        attribute: string;
        label: string;
        reasonCode: string;
        sortOrder: number | string;
        serviceType: string | null;
      }[]
    >`
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
          ${serviceType}::text IS NULL
          OR service_type IS NULL
          OR service_type = ${serviceType}
          OR (
            ${serviceType} = 'person_ride'
            AND lower(trim(coalesce(service_type, ''))) IN ('ride', 'person', 'person_ride')
          )
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
    return pickReasonsForService(raw.map(mapRow), serviceType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/column .*channel.* does not exist/i.test(msg)) throw e;
  }

  const legacy = await sql<
    {
      id: number | string;
      attribute: string;
      label: string;
      reasonCode: string;
      sortOrder: number | string;
      serviceType: string | null;
    }[]
  >`
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
    ORDER BY sort_order ASC, id ASC
  `;
  return legacy.map(mapRow);
}
