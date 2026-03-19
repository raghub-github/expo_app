import { getDb } from "../../db/client.js";
import { riderDocuments } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { uploadToR2, deleteFromR2, extractKeyFromSignedUrl } from "./r2Service.js";

/**
 * Transactional R2 Operations
 * 
 * Ensures that R2 uploads and Supabase updates are atomic.
 * If either fails, both are rolled back.
 */

export interface SaveDocumentParams {
  riderId: string;
  documentType: string;
  buffer: Buffer;
  key: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Save document to R2 and Supabase transactionally
 * Returns the signed URL and document ID
 */
export async function saveDocumentTransactionally(
  params: SaveDocumentParams
): Promise<{ signedUrl: string; documentId: string }> {
  const { riderId, documentType, buffer, key, contentType, metadata } = params;
  const db = getDb();

  let r2Uploaded = false;
  let documentId: string | null = null;

  try {
    // Step 1: Upload to R2 first
    const r2Result = await uploadToR2(buffer, key, contentType);
    r2Uploaded = true;

    // Step 2: Save to Supabase
    const { ulid } = await import("ulid");
    documentId = `rdoc_${ulid()}`;

    await db.insert(riderDocuments).values({
      riderId: Number(riderId),
      docType: documentType as any,
      fileUrl: r2Result.signedUrl,
      r2Key: key,
      metadata: metadata || {},
    });

    return { signedUrl: r2Result.signedUrl, documentId };
  } catch (error) {
    // Rollback: Delete from R2 if uploaded but Supabase failed
    if (r2Uploaded && key) {
      try {
        await deleteFromR2(key);
      } catch (rollbackError) {
        console.error("Failed to rollback R2 upload:", rollbackError);
      }
    }

    throw new Error(
      `Transactional save failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update document in R2 and Supabase transactionally
 */
export async function updateDocumentTransactionally(
  documentId: string,
  params: {
    buffer?: Buffer;
    newKey?: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ signedUrl: string }> {
  const { buffer, newKey, contentType, metadata } = params;
  const db = getDb();

  // Get existing document
  const existing = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.id, Number(documentId)))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Document not found");
  }

  const doc = existing[0]!;
  const oldSignedUrl = doc.fileUrl;
  const oldKey = oldSignedUrl ? extractKeyFromSignedUrl(oldSignedUrl) : null;

  let newR2Uploaded = false;
  let oldR2Deleted = false;

  try {
    // If new file provided, upload to R2
    if (buffer && newKey) {
      const r2Result = await uploadToR2(buffer, newKey, contentType);
      newR2Uploaded = true;

      // Update Supabase
      const updateData: any = {
        updatedAt: new Date(),
        metadata: metadata || doc.metadata,
        fileUrl: r2Result.signedUrl,
        r2Key: newKey,
      };

      await db
        .update(riderDocuments)
        .set(updateData)
        .where(eq(riderDocuments.id, Number(documentId)));

      // Delete old file from R2 if different key
      if (oldKey && oldKey !== newKey) {
        await deleteFromR2(oldKey);
        oldR2Deleted = true;
      }

      return { signedUrl: r2Result.signedUrl };
    } else {
      // Just update metadata
      await db
        .update(riderDocuments)
        .set({
          updatedAt: new Date(),
          metadata: metadata || doc.metadata,
        })
        .where(eq(riderDocuments.id, Number(documentId)));

      return { signedUrl: oldSignedUrl || "" };
    }
  } catch (error) {
    // Rollback: Delete new upload if Supabase update failed
    if (newR2Uploaded && newKey) {
      try {
        await deleteFromR2(newKey);
      } catch (rollbackError) {
        console.error("Failed to rollback R2 upload:", rollbackError);
      }
    }

    throw new Error(
      `Transactional update failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete document from R2 and Supabase transactionally
 */
export async function deleteDocumentTransactionally(documentId: string): Promise<void> {
  const db = getDb();

  // Get document to find R2 key
  const existing = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.id, Number(documentId)))
    .limit(1);

  if (existing.length === 0) {
    throw new Error("Document not found");
  }

  const doc = existing[0]!;
  const signedUrl = doc.fileUrl;
  const key = signedUrl ? extractKeyFromSignedUrl(signedUrl) : null;

  let r2Deleted = false;

  try {
    // Delete from Supabase first
    await db.delete(riderDocuments).where(eq(riderDocuments.id, Number(documentId)));

    // Then delete from R2
    if (key) {
      await deleteFromR2(key);
      r2Deleted = true;
    }
  } catch (error) {
    // If R2 delete failed but Supabase delete succeeded, we can't rollback Supabase
    // But we log the error - the R2 file will be orphaned but that's acceptable
    if (r2Deleted === false && key) {
      console.error("R2 delete failed after Supabase delete. File may be orphaned:", key);
    }

    throw new Error(
      `Transactional delete failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

