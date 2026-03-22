/**
 * Step 4 per-document rejection: structured issues stored in merchant_store_documents.step4_rejection_details[docType].
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

export const DOCUMENT_REJECTION_ISSUE_ACTIONS: Record<DocumentRejectionIssueCode, string> = {
  DOCUMENT_NUMBER_MISMATCH: "Update the document number (and related text fields) on the partner portal.",
  INCORRECT_DOCUMENT_DETAILS: "Correct the document details / holder name on the partner portal.",
  EXPIRED_DOCUMENT: "Upload a valid non-expired document or update the expiry date on the partner portal.",
  INVALID_OR_UNCLEAR_DOCUMENT_IMAGE: "Upload a new, clear scan or photo of the document on the partner portal.",
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
  const issues = o.issues.filter((x): x is DocumentRejectionIssueCode => typeof x === "string" && isValidRejectionIssueCode(x));
  if (issues.length === 0) return null;
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim() : undefined;
  return { issues, note };
}

/** Legacy rows (reason set but no structured detail): treat as image re-upload required. */
export function rejectionRequiresNewFileUpload(detail: Step4RejectionDetail | null): boolean {
  if (!detail || detail.issues.length === 0) return true;
  return detail.issues.includes("INVALID_OR_UNCLEAR_DOCUMENT_IMAGE");
}

export function buildStoredRejectionReason(issues: DocumentRejectionIssueCode[], note?: string): string {
  const parts = issues.map((c) => DOCUMENT_REJECTION_ISSUE_LABELS[c]);
  let s = parts.join(". ");
  if (note) s = `${s}${parts.length ? ". " : ""}${note}`;
  return s.trim();
}

export function parseRejectionIssuesFromBody(body: unknown): DocumentRejectionIssueCode[] {
  if (!body || typeof body !== "object" || body === null) return [];
  const raw = (body as { rejection_issues?: unknown }).rejection_issues;
  if (!Array.isArray(raw)) return [];
  const out: DocumentRejectionIssueCode[] = [];
  for (const x of raw) {
    if (typeof x === "string" && isValidRejectionIssueCode(x) && !out.includes(x)) out.push(x);
  }
  return out;
}
