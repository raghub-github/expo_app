import { getSql } from "../db/client.js";

export function normalizeDlNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return value.length >= 4 ? value : null;
}

/** True if another rider (optionally excluding `excludeRiderId`) already has this DL number. */
export async function isDlAlreadyRegistered(
  dlValue: string,
  excludeRiderId?: number
): Promise<boolean> {
  const dl = normalizeDlNumber(dlValue);
  if (!dl) return false;

  const sql = getSql();
  const exclude = excludeRiderId ?? null;

  const docRows = await sql`
    SELECT rd.id
    FROM rider_documents rd
    INNER JOIN riders r ON r.id = rd.rider_id
    WHERE r.deleted_at IS NULL
      AND rd.doc_type = 'dl'
      AND (
        upper(regexp_replace(coalesce(rd.doc_number, ''), '[^A-Za-z0-9]', '', 'g')) = ${dl}
        OR upper(regexp_replace(coalesce(rd.metadata->>'dlNumber', ''), '[^A-Za-z0-9]', '', 'g')) = ${dl}
      )
      AND (${exclude}::int IS NULL OR rd.rider_id <> ${exclude})
    LIMIT 1
  `;

  return docRows.length > 0;
}
