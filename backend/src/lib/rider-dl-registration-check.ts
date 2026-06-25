import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments } from "../db/schema.js";

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

  const db = getDb();
  const docWhere = and(
    eq(riderDocuments.docType, "dl"),
    excludeRiderId != null ? ne(riderDocuments.riderId, excludeRiderId) : undefined
  );
  const dlDocs = await db
    .select({
      id: riderDocuments.id,
      docNumber: riderDocuments.docNumber,
      metadata: riderDocuments.metadata,
    })
    .from(riderDocuments)
    .where(docWhere);

  for (const doc of dlDocs) {
    if (doc.docNumber?.toUpperCase() === dl) return true;
    const meta = doc.metadata as { dlNumber?: string } | null;
    if (typeof meta?.dlNumber === "string" && normalizeDlNumber(meta.dlNumber) === dl) {
      return true;
    }
  }

  return false;
}
