import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments, riders } from "../db/schema.js";

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

  const db = getDb();

  const riderWhere = and(
    eq(riders.aadhaarNumber, digits),
    isNull(riders.deletedAt),
    excludeRiderId != null ? ne(riders.id, excludeRiderId) : undefined
  );
  const [fromRider] = await db.select({ id: riders.id }).from(riders).where(riderWhere).limit(1);
  if (fromRider) return true;

  const docWhere = and(
    eq(riderDocuments.docType, "aadhaar"),
    eq(riderDocuments.docNumber, digits),
    excludeRiderId != null ? ne(riderDocuments.riderId, excludeRiderId) : undefined
  );
  const [fromDoc] = await db
    .select({ id: riderDocuments.id })
    .from(riderDocuments)
    .where(docWhere)
    .limit(1);

  return Boolean(fromDoc);
}
