/**
 * When a rider corrects RC plate (wrong → new), purge old RC photos from DB + R2.
 * Used by app Cashfree projection and dashboard project-rider-ev.
 */
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { riderDocumentFiles } from "../db/schema.js";
import { extractKeyFromSignedUrl } from "../services/r2/r2Service.js";
import {
  collectDocumentR2Keys,
  deleteReplacedR2Keys,
} from "./rider-document-r2-keys.js";

function normalizeRcPlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return v.length >= 4 ? v : null;
}

async function collectRcMediaKeys(args: {
  documentId: number;
  r2Key?: string | null;
  fileUrl?: string | null;
}): Promise<string[]> {
  const keys = new Set(
    await collectDocumentR2Keys(args.documentId, args.r2Key ?? null),
  );
  const fileUrl = String(args.fileUrl || "").trim();
  if (
    fileUrl &&
    fileUrl !== "electronic_verified" &&
    fileUrl !== "pending" &&
    fileUrl !== "n/a" &&
    /^https?:\/\//i.test(fileUrl)
  ) {
    const fromUrl = extractKeyFromSignedUrl(fileUrl);
    if (fromUrl?.trim()) keys.add(fromUrl.trim());
  }

  // Also pull file_url keys from side rows (may lack r2_key).
  try {
    const db = getDb();
    const fileRows = await db
      .select({
        fileUrl: riderDocumentFiles.fileUrl,
        r2Key: riderDocumentFiles.r2Key,
      })
      .from(riderDocumentFiles)
      .where(eq(riderDocumentFiles.documentId, args.documentId));
    for (const row of fileRows) {
      if (row.r2Key?.trim()) keys.add(row.r2Key.trim());
      const sideUrl = String(row.fileUrl || "").trim();
      if (sideUrl && /^https?:\/\//i.test(sideUrl)) {
        const k = extractKeyFromSignedUrl(sideUrl);
        if (k?.trim()) keys.add(k.trim());
      }
    }
  } catch {
    /* ignore */
  }

  return [...keys];
}

/**
 * Delete old RC photos from R2 + clear document file rows / keys.
 * Does not change doc_number (caller owns that).
 */
export async function purgeRiderRcDocumentMedia(documentId: number): Promise<{
  deletedKeys: string[];
}> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, r2_key, file_url
    FROM public.rider_documents
    WHERE id = ${documentId}
      AND doc_type = 'rc'
    LIMIT 1
  `) as unknown as Array<{
    id: number;
    r2_key: string | null;
    file_url: string | null;
  }>;

  if (rows.length === 0) return { deletedKeys: [] };

  const row = rows[0]!;
  const keys = await collectRcMediaKeys({
    documentId: row.id,
    r2Key: row.r2_key,
    fileUrl: row.file_url,
  });

  // Delete bucket objects first so we still have keys if DB delete fails mid-way.
  if (keys.length > 0) {
    await deleteReplacedR2Keys(keys, []);
  }

  await sql`
    DELETE FROM public.rider_document_files
    WHERE document_id = ${documentId}
  `;

  await sql`
    UPDATE public.rider_documents
    SET
      file_url = 'electronic_verified',
      r2_key = NULL,
      updated_at = NOW()
    WHERE id = ${documentId}
  `;

  return { deletedKeys: keys };
}

/**
 * If the rider's existing RC plate differs from `newRegistrationNumber`,
 * purge old RC media (R2 + DB) so wrong-plate photos do not stick.
 *
 * Previous plate preference:
 * 1) explicit `previousRegistrationNumber` (caller knows)
 * 2) active `rider_vehicles.registration_number` (survives dashboard doc_number overwrite)
 * 3) `rider_documents.doc_number`
 */
export async function clearRiderRcMediaIfPlateChanged(args: {
  riderId: number;
  newRegistrationNumber: string;
  previousRegistrationNumber?: string | null;
}): Promise<{ cleared: boolean; documentId: number | null; deletedKeys: string[] }> {
  const newReg = normalizeRcPlate(args.newRegistrationNumber);
  if (!newReg) {
    return { cleared: false, documentId: null, deletedKeys: [] };
  }

  const sql = getSql();
  const existing = (await sql`
    SELECT id, doc_number, r2_key, file_url
    FROM public.rider_documents
    WHERE rider_id = ${args.riderId}
      AND doc_type = 'rc'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `) as unknown as Array<{
    id: number;
    doc_number: string | null;
    r2_key: string | null;
    file_url: string | null;
  }>;

  if (existing.length === 0) {
    return { cleared: false, documentId: null, deletedKeys: [] };
  }

  const doc = existing[0]!;
  const vehicleRows = (await sql`
    SELECT registration_number
    FROM public.rider_vehicles
    WHERE rider_id = ${args.riderId}
      AND deleted_at IS NULL
    ORDER BY is_active DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT 1
  `) as unknown as Array<{ registration_number: string | null }>;

  const prev =
    normalizeRcPlate(args.previousRegistrationNumber) ||
    normalizeRcPlate(vehicleRows[0]?.registration_number) ||
    normalizeRcPlate(doc.doc_number);

  if (!prev || prev === newReg) {
    return { cleared: false, documentId: Number(doc.id), deletedKeys: [] };
  }

  const purged = await purgeRiderRcDocumentMedia(Number(doc.id));
  return {
    cleared: true,
    documentId: Number(doc.id),
    deletedKeys: purged.deletedKeys,
  };
}
