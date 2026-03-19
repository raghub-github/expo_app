/**
 * R2 path and URL helpers for parent merchant logo.
 * Same convention as partnersite: docs/merchants/{parent_code}/logo/{fileName}
 */

const R2_DOCS_PREFIX = "docs";
const R2_MERCHANT_PREFIX = `${R2_DOCS_PREFIX}/merchants`;

/** Parent root: docs/merchants/{parentMerchantCode} */
export function getParentRoot(parentMerchantCode: string): string {
  const id = (parentMerchantCode && String(parentMerchantCode).trim()) || "unknown";
  return `${R2_MERCHANT_PREFIX}/${id}`;
}

/** Parent logo folder: docs/merchants/{parentId}/logo */
export function getParentLogoPath(parentId: string): string {
  return `${getParentRoot(parentId)}/logo`;
}

/** Full R2 key for parent logo: docs/merchants/{parentId}/logo/{fileName} */
export function getParentLogoKey(parentId: string, fileName: string): string {
  const base = getParentLogoPath(parentId);
  return fileName ? `${base}/${fileName}` : base;
}

/**
 * Stored URL for DB (proxy format). Served by GET /api/attachments/proxy?key=...
 */
export function toStoredDocumentUrl(key: string | null | undefined): string | null {
  if (!key || typeof key !== "string") return null;
  const trimmed = key.trim();
  if (!trimmed) return null;
  const k = trimmed.replace(/^\/+/, "");
  return `/api/attachments/proxy?key=${encodeURIComponent(k)}`;
}
