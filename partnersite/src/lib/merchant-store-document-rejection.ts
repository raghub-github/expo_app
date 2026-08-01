/**
 * Keep in sync with dashboard/src/lib/merchant-store-document-rejection.ts
 */

export const DOCUMENT_REJECTION_ISSUE_CODES = [
  "DOCUMENT_NUMBER_MISMATCH",
  "INCORRECT_DOCUMENT_DETAILS",
  "EXPIRED_DOCUMENT",
  "INVALID_OR_UNCLEAR_DOCUMENT_IMAGE",
] as const;

export type DocumentRejectionIssueCode = (typeof DOCUMENT_REJECTION_ISSUE_CODES)[number];

export const DOCUMENT_REJECTION_ISSUE_LABELS: Record<DocumentRejectionIssueCode, string> = {
  DOCUMENT_NUMBER_MISMATCH: "Document number mismatch",
  INCORRECT_DOCUMENT_DETAILS: "Incorrect document details",
  EXPIRED_DOCUMENT: "Expired document",
  INVALID_OR_UNCLEAR_DOCUMENT_IMAGE: "Invalid or unclear document image",
};

export type Step4RejectionDetail = {
  issues: DocumentRejectionIssueCode[];
  note?: string;
};

export function isValidRejectionIssueCode(s: string): s is DocumentRejectionIssueCode {
  return (DOCUMENT_REJECTION_ISSUE_CODES as readonly string[]).includes(s);
}

export function rejectionDetailForDocType(root: unknown, docType: string): Step4RejectionDetail | null {
  if (!root || typeof root !== "object" || root === null) return null;
  const raw = (root as Record<string, unknown>)[docType];
  if (!raw || typeof raw !== "object" || raw === null) return null;
  const o = raw as { issues?: unknown; note?: unknown };
  if (!Array.isArray(o.issues)) return null;
  const issues = o.issues.filter(
    (x): x is DocumentRejectionIssueCode => typeof x === "string" && isValidRejectionIssueCode(x)
  );
  if (issues.length === 0) return null;
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim() : undefined;
  return { issues, note };
}

export function rejectionRequiresNewFileUpload(detail: Step4RejectionDetail | null): boolean {
  if (!detail || detail.issues.length === 0) return true;
  return detail.issues.includes("INVALID_OR_UNCLEAR_DOCUMENT_IMAGE");
}

export function formatRejectionAlertMessage(
  docLabel: string,
  reason: string | null | undefined,
  detail: Step4RejectionDetail | null
): string {
  if (detail?.issues?.length) {
    const labels = detail.issues.map((c) => DOCUMENT_REJECTION_ISSUE_LABELS[c]).join("; ");
    const note = detail.note?.trim();
    return note ? `${docLabel}: ${labels}. ${note}` : `${docLabel}: ${labels}.`;
  }
  if (reason?.trim()) return reason.trim();
  return `${docLabel} was rejected. Please upload a valid document.`;
}
