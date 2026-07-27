import { getSql } from "../db/client.js";

export function normalizePan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const pan = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : null;
}

/** True if another rider (optionally excluding `excludeRiderId`) already has this PAN. */
export async function isPanAlreadyRegistered(
  panValue: string,
  excludeRiderId?: number
): Promise<boolean> {
  const pan = normalizePan(panValue);
  if (!pan) return false;

  const sql = getSql();
  const exclude = excludeRiderId ?? null;

  const riderRows = await sql`
    SELECT id
    FROM riders
    WHERE deleted_at IS NULL
      AND upper(regexp_replace(coalesce(pan_number, ''), '[^A-Za-z0-9]', '', 'g')) = ${pan}
      AND (${exclude}::int IS NULL OR id <> ${exclude})
    LIMIT 1
  `;
  if (riderRows.length > 0) return true;

  const docRows = await sql`
    SELECT rd.id
    FROM rider_documents rd
    INNER JOIN riders r ON r.id = rd.rider_id
    WHERE r.deleted_at IS NULL
      AND rd.doc_type = 'pan'
      AND (
        upper(regexp_replace(coalesce(rd.doc_number, ''), '[^A-Za-z0-9]', '', 'g')) = ${pan}
        OR upper(regexp_replace(coalesce(rd.metadata->>'panNumber', ''), '[^A-Za-z0-9]', '', 'g')) = ${pan}
      )
      AND (${exclude}::int IS NULL OR rd.rider_id <> ${exclude})
    LIMIT 1
  `;

  return docRows.length > 0;
}
