import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { riderDocumentFiles, riderDocuments, riders } from "@/lib/db/schema";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";

const PENDING_FILE_URL = "pending";
const SELFIE_DOC_TYPES = ["selfie", "profile_photo"] as const;

function toViewUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === PENDING_FILE_URL) return null;
  const resolved = resolveAttachmentProxyUrl(trimmed);
  return resolved || null;
}

/** Normalize a stored riders.selfie_url value for browser display. */
export function resolveRiderSelfieFromStored(raw: string | null | undefined): string | null {
  return toViewUrl(raw);
}

/**
 * Resolves rider selfie for dashboard display (proxy URL for R2 keys / legacy paths).
 */
export async function getRiderSelfieViewUrl(riderId: number): Promise<string | null> {
  const db = getDb();

  const [rider] = await db
    .select({ selfieUrl: riders.selfieUrl })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  let url = toViewUrl(rider?.selfieUrl ?? null);
  if (url) return url;

  const [selfieDoc] = await db
    .select({
      id: riderDocuments.id,
      fileUrl: riderDocuments.fileUrl,
      r2Key: riderDocuments.r2Key,
    })
    .from(riderDocuments)
    .where(
      and(
        eq(riderDocuments.riderId, riderId),
        inArray(riderDocuments.docType, [...SELFIE_DOC_TYPES]),
      ),
    )
    .orderBy(desc(riderDocuments.createdAt))
    .limit(1);

  if (!selfieDoc) return null;

  url = toViewUrl(selfieDoc.r2Key ?? selfieDoc.fileUrl);
  if (url) return url;

  const [file] = await db
    .select({
      fileUrl: riderDocumentFiles.fileUrl,
      r2Key: riderDocumentFiles.r2Key,
    })
    .from(riderDocumentFiles)
    .where(eq(riderDocumentFiles.documentId, selfieDoc.id))
    .orderBy(desc(riderDocumentFiles.sortOrder))
    .limit(1);

  url = toViewUrl(file?.r2Key ?? file?.fileUrl);
  if (url) return url;

  return toViewUrl(`riders/${riderId}/documents/selfie/latest.jpg`);
}
