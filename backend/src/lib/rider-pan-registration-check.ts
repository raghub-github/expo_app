import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments, riders } from "../db/schema.js";

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

  const db = getDb();

  const riderWhere = and(
    eq(riders.panNumber, pan),
    isNull(riders.deletedAt),
    excludeRiderId != null ? ne(riders.id, excludeRiderId) : undefined
  );
  const [fromRider] = await db.select({ id: riders.id }).from(riders).where(riderWhere).limit(1);
  if (fromRider) return true;

  const docWhere = and(
    eq(riderDocuments.docType, "pan"),
    excludeRiderId != null ? ne(riderDocuments.riderId, excludeRiderId) : undefined
  );
  const panDocs = await db
    .select({
      id: riderDocuments.id,
      docNumber: riderDocuments.docNumber,
      metadata: riderDocuments.metadata,
    })
    .from(riderDocuments)
    .where(docWhere);

  for (const doc of panDocs) {
    if (doc.docNumber?.toUpperCase() === pan) return true;
    const meta = doc.metadata as { panNumber?: string } | null;
    if (typeof meta?.panNumber === "string" && meta.panNumber.toUpperCase() === pan) {
      return true;
    }
  }

  return false;
}
