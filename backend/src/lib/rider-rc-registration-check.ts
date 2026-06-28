import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments } from "../db/schema.js";

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

  const db = getDb();
  const docWhere = and(
    eq(riderDocuments.docType, "rc"),
    excludeRiderId != null ? ne(riderDocuments.riderId, excludeRiderId) : undefined
  );
  const rcDocs = await db
    .select({
      id: riderDocuments.id,
      docNumber: riderDocuments.docNumber,
      metadata: riderDocuments.metadata,
    })
    .from(riderDocuments)
    .where(docWhere);

  for (const doc of rcDocs) {
    if (doc.docNumber?.toUpperCase() === rc) return true;
    const meta = doc.metadata as { rcNumber?: string } | null;
    if (typeof meta?.rcNumber === "string" && normalizeRcNumber(meta.rcNumber) === rc) {
      return true;
    }
  }

  return false;
}
