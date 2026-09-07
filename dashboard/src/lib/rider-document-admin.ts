import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { riderDocuments, riderDocumentFiles, riders } from "@/lib/db/schema";
import { deleteDocument, uploadWithKey } from "@/lib/services/r2";
import { deleteR2ObjectForStoredUrl } from "@/lib/r2-proxy-url";
import {
  isMultiSideBaseType,
  parseDisplayDocType,
  proxyUrlFromR2Key,
  stableRiderDocumentKey,
  type DocumentSide,
} from "@/lib/rider-document-keys";

const PENDING_FILE_URL = "pending";

async function deleteStoredObject(r2Key?: string | null, fileUrl?: string | null): Promise<void> {
  if (r2Key?.trim()) {
    try {
      await deleteDocument(r2Key.trim());
    } catch {
      /* non-fatal */
    }
    return;
  }
  await deleteR2ObjectForStoredUrl(fileUrl);
}

async function syncParentDocumentFromFiles(documentId: number): Promise<void> {
  const db = getDb();
  const files = await db
    .select()
    .from(riderDocumentFiles)
    .where(eq(riderDocumentFiles.documentId, documentId))
    .orderBy(riderDocumentFiles.sortOrder);

  if (files.length === 0) {
    await db
      .update(riderDocuments)
      .set({
        fileUrl: PENDING_FILE_URL,
        r2Key: null,
        updatedAt: new Date(),
      })
      .where(eq(riderDocuments.id, documentId));
    return;
  }

  const primary = files[0]!;
  await db
    .update(riderDocuments)
    .set({
      fileUrl: primary.fileUrl,
      r2Key: primary.r2Key,
      updatedAt: new Date(),
    })
    .where(eq(riderDocuments.id, documentId));
}

async function syncRiderProfileFields(
  riderId: number,
  baseType: string,
  fileUrl: string | null,
  removed: boolean
): Promise<void> {
  const db = getDb();
  if (baseType === "selfie") {
    await db
      .update(riders)
      .set({
        selfieUrl: removed ? null : fileUrl,
        updatedAt: new Date(),
      })
      .where(eq(riders.id, riderId));
  }
}

export async function removeRiderDocumentImage(params: {
  riderId: number;
  documentId: number;
  displayDocType: string;
}): Promise<Record<string, unknown>> {
  const { riderId, documentId, displayDocType } = params;
  const { baseType, side } = parseDisplayDocType(displayDocType);
  const db = getDb();

  const [doc] = await db
    .select()
    .from(riderDocuments)
    .where(and(eq(riderDocuments.id, documentId), eq(riderDocuments.riderId, riderId)))
    .limit(1);

  if (!doc) throw new Error("Document not found");

  if (isMultiSideBaseType(baseType) && side !== "single") {
    const [fileRow] = await db
      .select()
      .from(riderDocumentFiles)
      .where(and(eq(riderDocumentFiles.documentId, documentId), eq(riderDocumentFiles.side, side)))
      .limit(1);

    if (fileRow) {
      await deleteStoredObject(fileRow.r2Key, fileRow.fileUrl);
      await db.delete(riderDocumentFiles).where(eq(riderDocumentFiles.id, fileRow.id));
    } else if (doc.r2Key && side === "front") {
      await deleteStoredObject(doc.r2Key, doc.fileUrl);
    }

    await syncParentDocumentFromFiles(documentId);
    const [updated] = await db
      .select()
      .from(riderDocuments)
      .where(eq(riderDocuments.id, documentId))
      .limit(1);
    return updated ?? doc;
  }

  const fileRows = await db
    .select()
    .from(riderDocumentFiles)
    .where(eq(riderDocumentFiles.documentId, documentId));

  for (const f of fileRows) {
    await deleteStoredObject(f.r2Key, f.fileUrl);
  }
  if (fileRows.length > 0) {
    await db.delete(riderDocumentFiles).where(eq(riderDocumentFiles.documentId, documentId));
  }

  await deleteStoredObject(doc.r2Key, doc.fileUrl);

  const [updated] = await db
    .update(riderDocuments)
    .set({
      fileUrl: PENDING_FILE_URL,
      r2Key: null,
      updatedAt: new Date(),
    })
    .where(eq(riderDocuments.id, documentId))
    .returning();

  await syncRiderProfileFields(riderId, baseType, null, true);
  return updated ?? doc;
}

export async function uploadRiderDocumentImage(params: {
  riderId: number;
  documentId: number;
  displayDocType: string;
  file: File;
  docNumber?: string;
}): Promise<Record<string, unknown>> {
  const { riderId, documentId, displayDocType, file, docNumber } = params;
  const { baseType, side } = parseDisplayDocType(displayDocType);
  const db = getDb();

  const [doc] = await db
    .select()
    .from(riderDocuments)
    .where(and(eq(riderDocuments.id, documentId), eq(riderDocuments.riderId, riderId)))
    .limit(1);

  if (!doc) throw new Error("Document not found");

  const uploadSide: DocumentSide = isMultiSideBaseType(baseType) ? side : "single";
  const r2Key = stableRiderDocumentKey(riderId, baseType, uploadSide);
  const proxyUrl = proxyUrlFromR2Key(r2Key);

  const [existingFile] =
    isMultiSideBaseType(baseType) && side !== "single"
      ? await db
          .select()
          .from(riderDocumentFiles)
          .where(and(eq(riderDocumentFiles.documentId, documentId), eq(riderDocumentFiles.side, side)))
          .limit(1)
      : [];

  const replaceOldKey = existingFile?.r2Key ?? doc.r2Key ?? null;
  if (replaceOldKey && replaceOldKey !== r2Key) {
    await deleteStoredObject(replaceOldKey, existingFile?.fileUrl ?? doc.fileUrl);
  }

  await uploadWithKey(file, r2Key);

  const docUpdates: Record<string, unknown> = {
    fileUrl: proxyUrl,
    r2Key,
    updatedAt: new Date(),
  };
  if (docNumber !== undefined) {
    docUpdates.docNumber = docNumber.trim() || null;
  }

  if (isMultiSideBaseType(baseType) && side !== "single") {
    if (existingFile) {
      await db
        .update(riderDocumentFiles)
        .set({
          fileUrl: proxyUrl,
          r2Key,
          mimeType: file.type || "image/jpeg",
        })
        .where(eq(riderDocumentFiles.id, existingFile.id));
    } else {
      const sortOrder = side === "front" ? 0 : 1;
      await db.insert(riderDocumentFiles).values({
        documentId,
        fileUrl: proxyUrl,
        r2Key,
        side,
        mimeType: file.type || "image/jpeg",
        sortOrder,
      });
    }

    if (side === "front" || !doc.r2Key || doc.fileUrl === PENDING_FILE_URL) {
      await db.update(riderDocuments).set(docUpdates).where(eq(riderDocuments.id, documentId));
    } else {
      await db
        .update(riderDocuments)
        .set({
          ...(docNumber !== undefined ? { docNumber: docNumber.trim() || null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(riderDocuments.id, documentId));
    }
  } else {
    await db.update(riderDocuments).set(docUpdates).where(eq(riderDocuments.id, documentId));
  }

  await syncRiderProfileFields(riderId, baseType, proxyUrl, false);

  const [updated] = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.id, documentId))
    .limit(1);

  return updated ?? doc;
}

const ALLOWED_DISPLAY_DOC_TYPES = new Set([
  "aadhaar_front",
  "aadhaar_back",
  "pan",
  "selfie",
  "dl_front",
  "dl_back",
  "rc",
  "rental_proof",
  "ev_proof",
  "bank_proof",
  "insurance",
  "vehicle_image",
  "upi_qr_proof",
]);

export function isAllowedAdminDisplayDocType(displayDocType: string): boolean {
  return ALLOWED_DISPLAY_DOC_TYPES.has(displayDocType);
}

/** Rider app stores composite docs as `aadhaar` / `dl`; dashboard UI uses `_front` / `_back`. */
export function storedDocTypeForDisplay(displayDocType: string): string {
  const { baseType } = parseDisplayDocType(displayDocType);
  if (isMultiSideBaseType(baseType)) return baseType;
  return displayDocType;
}

export function serializeRiderDocumentForDashboard(
  row: typeof riderDocuments.$inferSelect,
  displayDocType: string,
) {
  return {
    id: row.id,
    docType: displayDocType,
    fileUrl: row.fileUrl,
    r2Key: row.r2Key,
    docNumber: row.docNumber,
    verificationMethod: row.verificationMethod,
    verified: row.verified,
    verifierUserId: row.verifierUserId,
    verifierName: null as string | null,
    rejectedReason: row.rejectedReason,
    extractedName: row.extractedName,
    extractedDob: row.extractedDob ? String(row.extractedDob).slice(0, 10) : null,
    extractedDataSummary: row.extractedDataSummary ?? null,
    lastVerificationId: row.lastVerificationId ?? null,
    lastProviderReference: row.lastProviderReference ?? null,
    metadata: row.metadata ?? null,
    verifiedAt: row.verifiedAt?.toISOString?.() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Find or create the same rider_documents row the rider app uses, so dashboard
 * upload / electronic verify persist in one place.
 */
export async function ensureRiderDocumentRow(params: {
  riderId: number;
  displayDocType: string;
}): Promise<{ row: typeof riderDocuments.$inferSelect; created: boolean }> {
  const { riderId, displayDocType } = params;
  if (!isAllowedAdminDisplayDocType(displayDocType)) {
    throw new Error("Invalid document type");
  }

  const storedType = storedDocTypeForDisplay(displayDocType);
  const db = getDb();
  const candidates = Array.from(new Set([storedType, displayDocType]));

  const existing = await db
    .select()
    .from(riderDocuments)
    .where(and(eq(riderDocuments.riderId, riderId), inArray(riderDocuments.docType, candidates as never)))
    .orderBy(desc(riderDocuments.updatedAt));

  const preferred =
    existing.find((d) => d.docType === storedType) ?? existing[0] ?? null;
  if (preferred) return { row: preferred, created: false };

  const [created] = await db
    .insert(riderDocuments)
    .values({
      riderId,
      docType: storedType as never,
      fileUrl: PENDING_FILE_URL,
      verificationMethod: "MANUAL_UPLOAD",
      verificationStatus: "pending",
      verified: false,
      requiresManualReview: true,
      metadata: { createdFromDashboard: true },
    })
    .returning();

  if (!created) throw new Error("Could not create document row");
  return { row: created, created: true };
}

export async function createOrUpdateRiderDocumentFromAdmin(params: {
  riderId: number;
  displayDocType: string;
  file?: File | null;
  docNumber?: string;
}): Promise<ReturnType<typeof serializeRiderDocumentForDashboard>> {
  const { riderId, displayDocType, file, docNumber } = params;
  const { row } = await ensureRiderDocumentRow({ riderId, displayDocType });

  if (file && file.size > 0) {
    const updated = await uploadRiderDocumentImage({
      riderId,
      documentId: row.id,
      displayDocType,
      file,
      docNumber,
    });
    const merged = { ...row, ...updated } as typeof riderDocuments.$inferSelect;
    return serializeRiderDocumentForDashboard(merged, displayDocType);
  }

  if (docNumber !== undefined) {
    const db = getDb();
    const [updated] = await db
      .update(riderDocuments)
      .set({
        docNumber: docNumber.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(riderDocuments.id, row.id))
      .returning();
    return serializeRiderDocumentForDashboard(updated ?? row, displayDocType);
  }

  return serializeRiderDocumentForDashboard(row, displayDocType);
}
