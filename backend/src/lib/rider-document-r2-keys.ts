import { getDb } from "../db/client.js";
import { riderDocumentFiles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { deleteFromR2 } from "../services/r2/r2Service.js";

export function stableRiderDocumentKey(
  riderId: number | string,
  docType: string,
  side: "front" | "back" | "single" = "single"
): string {
  const base = `riders/${riderId}/documents/${docType}`;
  if (side === "single") return `${base}/latest.jpg`;
  return `${base}/${side}.jpg`;
}

export async function collectDocumentR2Keys(documentId: number, primaryKey?: string | null): Promise<string[]> {
  const db = getDb();
  const keys = new Set<string>();
  if (primaryKey?.trim()) keys.add(primaryKey.trim());

  const fileRows = await db
    .select({ r2Key: riderDocumentFiles.r2Key })
    .from(riderDocumentFiles)
    .where(eq(riderDocumentFiles.documentId, documentId));

  for (const row of fileRows) {
    if (row.r2Key?.trim()) keys.add(row.r2Key.trim());
  }
  return [...keys];
}

export async function deleteReplacedR2Keys(previousKeys: string[], nextKeys: string[]): Promise<void> {
  const keep = new Set(nextKeys.map((k) => k.trim()).filter(Boolean));
  for (const key of previousKeys) {
    const trimmed = key.trim();
    if (!trimmed || keep.has(trimmed)) continue;
    try {
      await deleteFromR2(trimmed);
    } catch (error) {
      console.warn(`[R2] Failed to delete replaced object ${trimmed}:`, error);
    }
  }
}
