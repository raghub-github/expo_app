/**
 * Document LIFECYCLE state — the rich, rider-facing view of a single document that the
 * spec (§2, §17) asks for, DERIVED from the existing rider_documents columns (no new enum
 * or table; §35). It layers the "is it required?" question on top of "what is its
 * verification state?" so the UI/agent can distinguish, e.g., OPTIONAL_NOT_SUBMITTED from
 * REQUIRED_NOT_SUBMITTED, and AUTO_VERIFIED from MANUALLY_VERIFIED.
 *
 * This is a pure projection: the eligibility ENGINE still consumes the coarse DocState
 * (verified/pending/failed/expired/missing); this module is what humans see.
 */
import type { DocRequirement } from "./eligibilityEngine.js";

export type DocumentLifecycleState =
  | "NOT_STARTED" // not required (exempt) and not submitted
  | "OPTIONAL_NOT_SUBMITTED" // optional for current policy, not submitted
  | "REQUIRED_NOT_SUBMITTED" // required for some service/onboarding, not submitted
  | "SUBMITTED" // uploaded, not yet processed
  | "VERIFYING" // provider check in progress / pending
  | "AUTO_VERIFIED" // provider (Cashfree) auto-verified
  | "MANUALLY_VERIFIED" // agent approved
  | "AUTO_FAILED" // provider auto-rejected / inconclusive
  | "MANUAL_REVIEW_REQUIRED" // needs an agent decision
  | "REJECTED" // agent rejected
  | "RESUBMISSION_REQUIRED" // rejected + still required → rider must re-upload
  | "EXPIRED"; // was verified but past validity

/** The raw document row shape this resolver needs (subset of rider_documents). */
export type DocRow = {
  verified: boolean | null;
  verificationStatus: string | null; // pending | auto_verified | auto_rejected | approved | rejected
  verificationMethod?: string | null; // auto | manual | pending | CASHFREE_* | ...
  requiresManualReview?: boolean | null;
  expiresAt?: Date | string | null;
  submitted?: boolean; // a row/file exists
} | null | undefined;

function isExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

function isVerified(row: NonNullable<DocRow>): boolean {
  const status = String(row.verificationStatus || "").toLowerCase();
  const method = String(row.verificationMethod || "").toUpperCase();
  return (
    row.verified === true ||
    status === "auto_verified" ||
    status === "approved" ||
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK"
  );
}

function isAuto(row: NonNullable<DocRow>): boolean {
  const status = String(row.verificationStatus || "").toLowerCase();
  const method = String(row.verificationMethod || "").toUpperCase();
  return status.startsWith("auto_") || method.startsWith("CASHFREE_") || method === "APP_VERIFIED";
}

/**
 * Resolve the lifecycle state for one document given its row and its requirement under the
 * currently effective policy. `submitted` distinguishes "a row exists" from a bare stub.
 */
export function resolveDocumentLifecycleState(
  row: DocRow,
  requirement: DocRequirement,
  now: Date = new Date()
): DocumentLifecycleState {
  const submitted = Boolean(row && (row.submitted !== false));
  if (!row || !submitted) {
    if (requirement === "required") return "REQUIRED_NOT_SUBMITTED";
    if (requirement === "optional") return "OPTIONAL_NOT_SUBMITTED";
    return "NOT_STARTED";
  }

  const status = String(row.verificationStatus || "").toLowerCase();

  // Expiry wins over a stale "verified" flag.
  if (isExpired(row.expiresAt, now) && isVerified(row)) return "EXPIRED";

  if (isVerified(row)) return isAuto(row) ? "AUTO_VERIFIED" : "MANUALLY_VERIFIED";

  if (status === "rejected") return requirement === "required" ? "RESUBMISSION_REQUIRED" : "REJECTED";
  if (status === "auto_rejected") return "AUTO_FAILED";
  if (row.requiresManualReview === true) return "MANUAL_REVIEW_REQUIRED";
  if (status === "pending" || status === "verifying") return "VERIFYING";
  return "SUBMITTED";
}

/** Coarse buckets for UI grouping / at-a-glance. */
export function isTerminalVerified(state: DocumentLifecycleState): boolean {
  return state === "AUTO_VERIFIED" || state === "MANUALLY_VERIFIED";
}
export function needsRiderAction(state: DocumentLifecycleState): boolean {
  return (
    state === "REQUIRED_NOT_SUBMITTED" ||
    state === "RESUBMISSION_REQUIRED" ||
    state === "REJECTED" ||
    state === "AUTO_FAILED" ||
    state === "EXPIRED"
  );
}
