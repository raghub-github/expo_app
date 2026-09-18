import { getSql } from "../db/client.js";

export function normalizeRcNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return value.length >= 4 ? value : null;
}

/** True if another rider (optionally excluding `excludeRiderId`) already has this RC number. */
export async function isRcAlreadyRegistered(
  rcValue: string,
  excludeRiderId?: number
): Promise<boolean> {
  const rc = normalizeRcNumber(rcValue);
  if (!rc) return false;

  const sql = getSql();
  const exclude = excludeRiderId ?? null;

  const docRows = await sql`
    SELECT rd.id
    FROM rider_documents rd
    INNER JOIN riders r ON r.id = rd.rider_id
    WHERE r.deleted_at IS NULL
      AND rd.doc_type = 'rc'
      AND (
        upper(regexp_replace(coalesce(rd.doc_number, ''), '[^A-Za-z0-9]', '', 'g')) = ${rc}
        OR upper(regexp_replace(coalesce(rd.metadata->>'rcNumber', ''), '[^A-Za-z0-9]', '', 'g')) = ${rc}
      )
      AND (${exclude}::int IS NULL OR rd.rider_id <> ${exclude})
    LIMIT 1
  `;
  if (docRows.length > 0) return true;

  const vehicleRows = await sql`
    SELECT rv.id
    FROM rider_vehicles rv
    INNER JOIN riders r ON r.id = rv.rider_id
    WHERE r.deleted_at IS NULL
      AND rv.deleted_at IS NULL
      AND COALESCE(rv.vehicle_active_status, 'active') <> 'retired'
      AND upper(regexp_replace(coalesce(rv.registration_number, ''), '[^A-Za-z0-9]', '', 'g')) = ${rc}
      AND (${exclude}::int IS NULL OR rv.rider_id <> ${exclude})
    LIMIT 1
  `;
  return vehicleRows.length > 0;
}
