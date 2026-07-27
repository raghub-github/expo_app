import { getSql } from "../db/client.js";

export function normalizeAadhaarDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 12 ? digits : null;
}

/** True if another rider (optionally excluding `excludeRiderId`) already has this Aadhaar. */
export async function isAadhaarAlreadyRegistered(
  aadhaarDigits: string,
  excludeRiderId?: number
): Promise<boolean> {
  const digits = normalizeAadhaarDigits(aadhaarDigits);
  if (!digits) return false;

  const sql = getSql();
  const exclude = excludeRiderId ?? null;

  const riderRows = await sql`
    SELECT id
    FROM riders
    WHERE deleted_at IS NULL
      AND regexp_replace(coalesce(aadhaar_number, ''), '\D', '', 'g') = ${digits}
      AND (${exclude}::int IS NULL OR id <> ${exclude})
    LIMIT 1
  `;
  if (riderRows.length > 0) return true;

  const docRows = await sql`
    SELECT rd.id
    FROM rider_documents rd
    INNER JOIN riders r ON r.id = rd.rider_id
    WHERE r.deleted_at IS NULL
      AND rd.doc_type = 'aadhaar'
      AND (
        regexp_replace(coalesce(rd.doc_number, ''), '\D', '', 'g') = ${digits}
        OR regexp_replace(coalesce(rd.metadata->>'aadhaarNumber', ''), '\D', '', 'g') = ${digits}
      )
      AND (${exclude}::int IS NULL OR rd.rider_id <> ${exclude})
    LIMIT 1
  `;

  return docRows.length > 0;
}
