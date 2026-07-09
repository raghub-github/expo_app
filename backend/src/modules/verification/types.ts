/**
 * Verification module — shared domain types.
 *
 * These names are the single vocabulary used by the provider layer, the
 * service layer, the webhook receivers, and the admin routes. They mirror the
 * DB enums verbatim so any downstream code that reads a row can compare
 * strings directly.
 */

export type VerificationStatus =
  | "draft"
  | "initiated"
  | "otp_sent"
  | "otp_verified"
  | "provider_processing"
  | "webhook_received"
  | "manual_review"
  | "verified"
  | "rejected"
  | "consent_denied"
  | "expired"
  | "timeout"
  | "failed"
  | "duplicate"
  | "fraud_suspected"
  | "provider_down"
  | "fallback_manual"
  | "overridden"
  | "cancelled";

export type VerificationDocumentKind =
  | "pan"
  | "pan_360"
  | "aadhaar_digilocker"
  | "driving_licence"
  | "vehicle_rc"
  | "passport"
  | "ifsc"
  | "bank_account"
  | "reverse_penny_drop"
  | "upi_penny_drop"
  | "gstin"
  | "cin"
  | "face_liveness"
  | "face_match"
  | "name_match";

// razorpay was removed as a verification provider (drizzle/0396) — verification
// runs on Cashfree or manual review only. The DB enum still contains 'razorpay'
// for historical rows, but no new work may target it.
export type VerificationProvider = "cashfree" | "manual";

export type VerificationSubjectKind =
  | "rider"
  | "merchant_store"
  | "rider_document"
  | "merchant_document";

export type PolicyMode = "auto" | "manual" | "hybrid" | "disabled";

export type SwitchState = "enabled" | "disabled" | "force_manual" | "force_hybrid";

/**
 * Normalized outcome returned by every provider adapter. The service layer
 * writes this to `verification_requests` verbatim; the webhook receivers
 * produce the same shape when a webhook arrives.
 */
export type NormalizedVerification = {
  verificationId: string;
  attemptNumber: number;
  provider: VerificationProvider;
  providerReference: string | null;
  subjectType: VerificationSubjectKind;
  subjectId: number;
  documentKind: VerificationDocumentKind;
  status: VerificationStatus;
  statusReason: string | null;
  confidence: number | null;
  businessIdentifier: string | null;
  /** Structured extracted fields we care about (promoted-column candidates). */
  verifiedData: Record<string, unknown>;
  /** Raw provider response captured verbatim for the archive. */
  rawResponse: unknown;
  /** Raw request we sent, captured verbatim for the archive. */
  rawRequest: unknown;
  responseHeaders: Record<string, string>;
  httpStatus: number | null;
  durationMs: number | null;
  /** Provider-side artifact URLs (photo, XML, PDF, QR) that must be mirrored to R2. */
  providerArtifacts: Array<{
    kind: "photo" | "signature" | "xml" | "pdf" | "qr";
    url: string;
    expiresAt: string | null;
    contentType?: string;
  }>;
};

/** Identifies the (subject × doc) tuple a policy governs. */
export type PolicyKey = {
  subjectType: VerificationSubjectKind;
  documentKind: VerificationDocumentKind;
};

/** Effective policy after switches + subject_filter have been applied. */
export type EffectivePolicy = {
  policyId: number;
  policySnapshotId: number;
  mode: PolicyMode;
  provider: VerificationProvider | null;
  autoApprove: boolean;
  confidenceThreshold: number | null;
  retryLimit: number;
  retryBackoffSeconds: number;
  timeoutMs: number;
  fallbackToManual: boolean;
  subjectFilter: Record<string, unknown>;
};
