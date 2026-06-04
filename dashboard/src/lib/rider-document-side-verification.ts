/**
 * Per-side verification for composite rider documents (aadhaar, dl) stored as one
 * rider_documents row with front/back files in rider_document_files.
 */

export type DocumentSide = "front" | "back";

export type SideVerificationEntry = {
  verified: boolean;
  verificationStatus?: "pending" | "approved" | "rejected";
  verifiedAt?: string | null;
  verifierUserId?: number | null;
  rejectedReason?: string | null;
};

export type SideVerificationMap = Partial<Record<DocumentSide, SideVerificationEntry>>;

const COMPOSITE_BASE_TYPES = new Set(["aadhaar", "dl"]);

export function parseDisplayDocType(
  displayDocType?: string | null
): { baseType: string; side: DocumentSide | null } | null {
  if (!displayDocType?.trim()) return null;
  const t = displayDocType.trim();
  if (t.endsWith("_front")) return { baseType: t.slice(0, -6), side: "front" };
  if (t.endsWith("_back")) return { baseType: t.slice(0, -5), side: "back" };
  return null;
}

export function isCompositeBaseType(docType: string): boolean {
  return COMPOSITE_BASE_TYPES.has(docType);
}

export function readSideVerification(metadata: unknown): SideVerificationMap {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = (metadata as Record<string, unknown>).sideVerification;
  if (!raw || typeof raw !== "object") return {};
  return raw as SideVerificationMap;
}

export function isSideVerified(metadata: unknown, side: DocumentSide): boolean {
  const sv = readSideVerification(metadata);
  const entry = sv[side];
  if (entry?.verified === true || entry?.verificationStatus === "approved") return true;
  return false;
}

export function isSideRejected(metadata: unknown, side: DocumentSide): boolean {
  const sv = readSideVerification(metadata);
  return sv[side]?.verificationStatus === "rejected";
}

export function getSideRejectedReason(metadata: unknown, side: DocumentSide): string | null {
  const sv = readSideVerification(metadata);
  const reason = sv[side]?.rejectedReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

export function requiredSidesFromFiles(
  files: { side?: string | null }[]
): DocumentSide[] {
  const sides = files
    .map((f) => (f.side || "").toLowerCase())
    .filter((s): s is DocumentSide => s === "front" || s === "back");
  return [...new Set(sides)];
}

/** All required sides approved → parent document can be marked verified. */
export function areAllRequiredSidesApproved(
  metadata: unknown,
  files: { side?: string | null }[]
): boolean {
  const required = requiredSidesFromFiles(files);
  if (required.length === 0) return false;
  return required.every((side) => isSideVerified(metadata, side));
}

export function buildSideVerificationPatch(
  existingMetadata: unknown,
  side: DocumentSide,
  patch: SideVerificationEntry
): Record<string, unknown> {
  const base =
    existingMetadata && typeof existingMetadata === "object"
      ? { ...(existingMetadata as Record<string, unknown>) }
      : {};
  const prev = readSideVerification(existingMetadata);
  return {
    ...base,
    sideVerification: {
      ...prev,
      [side]: {
        ...(prev[side] ?? {}),
        ...patch,
      },
    },
  };
}

export function documentActionKey(doc: { id: number; docType: string }): string {
  return `${doc.id}:${doc.docType}`;
}

export function isExpandedDocVerified(
  parentDoc: { verified?: boolean; metadata?: unknown },
  side: string | null | undefined,
  hasMultipleFiles: boolean
): boolean {
  const normalized = (side || "").toLowerCase();
  if (hasMultipleFiles && (normalized === "front" || normalized === "back")) {
    if (isSideVerified(parentDoc.metadata, normalized)) return true;
    if (isSideRejected(parentDoc.metadata, normalized)) return false;
    const sv = readSideVerification(parentDoc.metadata);
    if (Object.keys(sv).length === 0 && parentDoc.verified) return true;
    return false;
  }
  return Boolean(parentDoc.verified);
}

export function getExpandedDocRejectedReason(
  parentDoc: { metadata?: unknown; rejectedReason?: string | null },
  side: string | null | undefined,
  hasMultipleFiles: boolean
): string | null {
  const normalized = (side || "").toLowerCase();
  if (hasMultipleFiles && (normalized === "front" || normalized === "back")) {
    return getSideRejectedReason(parentDoc.metadata, normalized);
  }
  return parentDoc.rejectedReason ?? null;
}
