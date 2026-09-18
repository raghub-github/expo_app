/**
 * Rider RC verification state machine.
 *
 * Maps onto existing rider_documents columns:
 *   auto_verified + verified     → AUTO_VERIFIED
 *   pending + requires_manual_review + mismatch photo → MANUAL_REVIEW_PENDING
 *   approved + verified          → MANUAL_VERIFIED
 *   rejected                     → MANUAL_REJECTED
 *
 * Cashfree still proves the vehicle is authentic. A name mismatch with the
 * rider's Aadhaar/identity does not auto-verify the RC photo — that photo
 * must be approved by an authorized admin/agent.
 */

export const RC_VERIFICATION_STATES = [
  "NOT_SUBMITTED",
  "AUTO_VERIFICATION_PENDING",
  "AUTO_VERIFIED",
  "NAME_MISMATCH",
  "MANUAL_REVIEW_PENDING",
  "MANUAL_VERIFIED",
  "MANUAL_REJECTED",
] as const;

export type RcVerificationState = (typeof RC_VERIFICATION_STATES)[number];

export type RcReviewHistoryEntry = {
  version: number;
  status: RcVerificationState;
  fileUrl: string | null;
  r2Key: string | null;
  uploadedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  rejectionReason?: string | null;
  active?: boolean;
};

export type OnboardingRcDoc = {
  fileUrl?: string | null;
  r2Key?: string | null;
  verified?: boolean | null;
  verificationMethod?: string | null;
  verificationStatus?: string | null;
  requiresManualReview?: boolean | null;
  metadata?: unknown;
  rejectedReason?: string | null;
};

export const RC_PAYMENT_BLOCKING_STATES: ReadonlySet<RcVerificationState> = new Set([
  // Photo still required (mismatch) or rejected — must re-upload before pay.
  // MANUAL_REVIEW_PENDING intentionally NOT blocking: rider may finish onboarding + pay.
  "NAME_MISMATCH",
  "MANUAL_REJECTED",
]);

export const RC_PAYMENT_ALLOWED_STATES: ReadonlySet<RcVerificationState> = new Set([
  "AUTO_VERIFIED",
  "MANUAL_VERIFIED",
  // Submitted for agent review — payment/onboarding may proceed; activation waits.
  "MANUAL_REVIEW_PENDING",
]);

function readMeta(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function isRcState(value: unknown): value is RcVerificationState {
  return typeof value === "string" && (RC_VERIFICATION_STATES as readonly string[]).includes(value);
}

export function normalizePersonNameForRc(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenizePersonName(name: string): string[] {
  return normalizePersonNameForRc(name)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Same algorithm as rider-app `softPersonNamesMatch` — do not tighten/loosen
 * without evidence; this is what currently unlocks AUTO_VERIFIED.
 */
export function rcOwnerAadhaarNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizePersonNameForRc(a);
  const nb = normalizePersonNameForRc(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(tokenizePersonName(na));
  const tb = new Set(tokenizePersonName(nb));
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  const denom = Math.max(ta.size, tb.size);
  return overlap / denom >= 0.7;
}

export function pickRcOwnerName(details: Record<string, unknown> | null | undefined): string {
  if (!details) return "";
  return String(
    details.owner ||
      details.owner_name ||
      details.registered_name ||
      details.name ||
      "",
  ).trim();
}

export function readCashfreeRcDetails(metadata: unknown): Record<string, unknown> | null {
  const meta = readMeta(metadata);
  const raw =
    meta.cashfreeVerifiedData ??
    meta.verifiedDetails ??
    meta.verifiedData ??
    meta.verified_data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

export function isRcElectronicStubUrl(fileUrl?: string | null): boolean {
  const url = String(fileUrl || "").trim().toLowerCase();
  if (!url) return false;
  return (
    url.includes("cashfree_rc_verified") ||
    url.includes("cashfree_dl_verified") ||
    url.includes("cashfree_pan_verified") ||
    url.includes("digilocker_verified") ||
    url.includes("aadhaar_masking_verified") ||
    url === "electronic_verified" ||
    url.includes("electronic_verified")
  );
}

export function isRcPlaceholderUrl(fileUrl?: string | null): boolean {
  const url = String(fileUrl || "").trim().toLowerCase();
  return !url || url === "pending" || url === "n/a";
}

export function isRcRealPhotoUrl(fileUrl?: string | null): boolean {
  const url = String(fileUrl || "").trim();
  if (!url) return false;
  if (isRcPlaceholderUrl(url) || isRcElectronicStubUrl(url)) return false;
  return true;
}

export function isRcCashfreeTagged(metadata: unknown, fileUrl?: string | null): boolean {
  const meta = readMeta(metadata);
  const method = String(meta.verificationMethod || "").toLowerCase();
  return (
    method === "cashfree_rc" ||
    isRcElectronicStubUrl(fileUrl) ||
    readCashfreeRcDetails(metadata) != null
  );
}

export function readRcDocumentVersion(metadata: unknown): number {
  const meta = readMeta(metadata);
  const raw = meta.documentVersion ?? meta.activeDocumentVersion;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function readRcReviewHistory(metadata: unknown): RcReviewHistoryEntry[] {
  const meta = readMeta(metadata);
  const raw = meta.rcReviewHistory;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is RcReviewHistoryEntry => {
    return Boolean(row && typeof row === "object" && Number((row as RcReviewHistoryEntry).version) >= 1);
  });
}

export function resolveRcVerificationState(doc?: OnboardingRcDoc | null): RcVerificationState {
  if (!doc) return "NOT_SUBMITTED";
  const meta = readMeta(doc.metadata);
  const status = String(doc.verificationStatus || "").toLowerCase();
  const method = String(doc.verificationMethod || "").toUpperCase();
  const verified = doc.verified === true;
  const mismatch = meta.rcOwnerAadhaarMismatch === true;
  const explicit = meta.rcVerificationState;
  const hasPhoto = isRcRealPhotoUrl(doc.fileUrl);
  const hasAnySubmission =
    Boolean(String(doc.fileUrl || "").trim()) ||
    Boolean(String(doc.r2Key || "").trim()) ||
    isRcCashfreeTagged(doc.metadata, doc.fileUrl);

  if (status === "rejected" || explicit === "MANUAL_REJECTED") {
    return "MANUAL_REJECTED";
  }

  if (verified) {
    const reviewMethod = String(meta.rcReviewMethod || "").toUpperCase();
    // Agent decision always wins over Cashfree method leftovers.
    if (
      explicit === "MANUAL_VERIFIED" ||
      reviewMethod === "ADMIN_MANUAL" ||
      status === "approved" ||
      method === "MANUAL_UPLOAD" ||
      (mismatch && status === "approved")
    ) {
      return "MANUAL_VERIFIED";
    }
    if (
      status === "auto_verified" ||
      method === "APP_VERIFIED" ||
      method.startsWith("CASHFREE_")
    ) {
      return "AUTO_VERIFIED";
    }
    return "MANUAL_VERIFIED";
  }

  if (explicit === "MANUAL_REVIEW_PENDING" || (mismatch && hasPhoto && status !== "rejected")) {
    return "MANUAL_REVIEW_PENDING";
  }

  if (explicit === "NAME_MISMATCH" || (mismatch && !hasPhoto)) {
    return "NAME_MISMATCH";
  }

  if (explicit === "AUTO_VERIFIED" && !verified) {
    return "AUTO_VERIFICATION_PENDING";
  }

  if (!hasAnySubmission) return "NOT_SUBMITTED";
  return "NOT_SUBMITTED";
}

export function isRcBlockingOnboardingPayment(
  doc?: OnboardingRcDoc | null,
  skipped = false,
): boolean {
  if (skipped) return false;
  return RC_PAYMENT_BLOCKING_STATES.has(resolveRcVerificationState(doc));
}

export function isRcAcceptableForOnboardingPayment(
  doc?: OnboardingRcDoc | null,
  skipped = false,
): boolean {
  if (skipped) return true;
  return RC_PAYMENT_ALLOWED_STATES.has(resolveRcVerificationState(doc));
}

/** Vehicle-step completeness: mismatch-without-photo / rejected RC cannot leave the RC step.
 * MANUAL_REVIEW_PENDING (photo submitted) counts as complete for onboarding progress + payment.
 */
export function isRcCompleteForOnboardingProgress(
  doc: OnboardingRcDoc | null | undefined,
  skipped: boolean,
  isUsable: (doc?: OnboardingRcDoc | null) => boolean,
): boolean {
  if (skipped) return true;
  if (isRcBlockingOnboardingPayment(doc, false)) return false;
  if (isRcAcceptableForOnboardingPayment(doc, false)) return true;
  return isUsable(doc);
}

export function rcPaymentBlockError(state: string): {
  error: "RC_VERIFICATION_PENDING" | "RC_VERIFICATION_REJECTED" | "RC_PHOTO_REQUIRED" | "documents_required";
  message: string;
} {
  if (state === "MANUAL_REVIEW_PENDING") {
    // Kept for backwards-compatible error codes; payment is no longer blocked on pending.
    return {
      error: "RC_VERIFICATION_PENDING",
      message:
        "Your RC document is under manual verification. You can continue onboarding and pay — approval happens after payment.",
    };
  }
  if (state === "MANUAL_REJECTED") {
    return {
      error: "RC_VERIFICATION_REJECTED",
      message: "RC verification was not approved. Please upload the original RC card photo again.",
    };
  }
  if (state === "NAME_MISMATCH") {
    return {
      error: "RC_PHOTO_REQUIRED",
      message: "Upload a clear original RC card photo for manual verification before payment.",
    };
  }
  return {
    error: "documents_required",
    message: "Please complete document submission first",
  };
}

export type RcSaveKind = "auto_verified" | "manual_review" | "photo_required" | "plain";

export function resolveRcSaveVerification(args: {
  fileUrl: string;
  r2Key?: string | null;
  metadata?: Record<string, unknown> | null;
  aadhaarName: string | null | undefined;
  existing?: OnboardingRcDoc | null;
}): {
  kind: RcSaveKind;
  ownerName: string;
  aadhaarName: string;
  namesMatch: boolean;
  cashfreeDetails: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  documentVersion: number;
} {
  const incomingMeta = readMeta(args.metadata);
  const existingMeta = readMeta(args.existing?.metadata);
  const cashfreeDetails =
    readCashfreeRcDetails(incomingMeta) || readCashfreeRcDetails(existingMeta);
  const ownerName = pickRcOwnerName(cashfreeDetails);
  const aadhaarName = String(args.aadhaarName || "").trim();
  const namesMatch = Boolean(ownerName) && Boolean(aadhaarName) && rcOwnerAadhaarNamesMatch(ownerName, aadhaarName);
  const tagged = isRcCashfreeTagged({ ...existingMeta, ...incomingMeta }, args.fileUrl);
  const realPhoto = isRcRealPhotoUrl(args.fileUrl);
  const now = new Date().toISOString();

  const prevVersion = args.existing ? readRcDocumentVersion(existingMeta) : 0;
  const prevHistory = args.existing ? readRcReviewHistory(existingMeta) : [];
  const prevState = args.existing ? resolveRcVerificationState(args.existing) : "NOT_SUBMITTED";

  let kind: RcSaveKind = "plain";
  // Any real RC photo upload must stay pending for agent review — never auto-verify
  // from Cashfree owner data alone once a photo is in the step. Stub URLs
  // (`cashfree_rc_verified`) may still auto-verify when names match — unless a
  // newer manual-review pipeline already owns the document.
  if (realPhoto) {
    kind = "manual_review";
  } else if (
    prevState === "MANUAL_REVIEW_PENDING" ||
    prevState === "MANUAL_VERIFIED" ||
    prevState === "MANUAL_REJECTED"
  ) {
    // Stale Cashfree stub must never overwrite manual review / agent decision.
    kind =
      prevState === "MANUAL_VERIFIED"
        ? "plain"
        : prevState === "MANUAL_REJECTED"
          ? "photo_required"
          : "manual_review";
  } else if (tagged || cashfreeDetails) {
    if (namesMatch) {
      kind = "auto_verified";
    } else {
      kind = "photo_required";
    }
  }
  const shouldVersion =
    kind === "manual_review" &&
    args.existing &&
    (prevState === "MANUAL_REJECTED" ||
      prevState === "MANUAL_REVIEW_PENDING" ||
      isRcRealPhotoUrl(args.existing.fileUrl));
  const documentVersion = shouldVersion ? prevVersion + 1 : Math.max(1, prevVersion || 1);

  const history = [...prevHistory];
  if (shouldVersion && args.existing) {
    history.push({
      version: prevVersion,
      status: prevState === "NOT_SUBMITTED" ? "MANUAL_REJECTED" : prevState,
      fileUrl: args.existing.fileUrl ?? null,
      r2Key: args.existing.r2Key ?? null,
      uploadedAt:
        typeof existingMeta.manualSubmissionAt === "string"
          ? existingMeta.manualSubmissionAt
          : now,
      reviewedAt:
        typeof existingMeta.rcReviewedAt === "string" ? existingMeta.rcReviewedAt : now,
      reviewedBy:
        typeof existingMeta.rcReviewedBy === "number" ? existingMeta.rcReviewedBy : null,
      rejectionReason:
        typeof args.existing.rejectedReason === "string" ? args.existing.rejectedReason : null,
      active: false,
    });
  }

  const rcVerificationState: RcVerificationState =
    kind === "auto_verified"
      ? "AUTO_VERIFIED"
      : kind === "manual_review"
        ? "MANUAL_REVIEW_PENDING"
        : kind === "photo_required"
          ? "NAME_MISMATCH"
          : (existingMeta.rcVerificationState as RcVerificationState) || "NOT_SUBMITTED";

  const metadata: Record<string, unknown> = {
    ...existingMeta,
    ...incomingMeta,
    ...(cashfreeDetails
      ? {
          cashfreeVerifiedData: cashfreeDetails,
          verifiedDetails: cashfreeDetails,
          rcOwnerName: ownerName || incomingMeta.rcOwnerName || existingMeta.rcOwnerName || null,
        }
      : {}),
    ...(aadhaarName ? { aadhaarNameCompared: aadhaarName } : {}),
    rcVerificationState,
    documentVersion,
    activeDocumentVersion: documentVersion,
    rcReviewHistory: history,
  };

  if (kind === "auto_verified") {
    delete metadata.rcOwnerAadhaarMismatch;
    metadata.electronicVerifiedAt = now;
    metadata.verificationMethod = "cashfree_rc";
  } else if (kind === "manual_review") {
    metadata.rcOwnerAadhaarMismatch = true;
    metadata.manualSubmissionAt = now;
    metadata.rcReviewedAt = null;
    metadata.rcReviewedBy = null;
    metadata.verificationMethod = "manual_upload";
  } else if (kind === "photo_required") {
    metadata.rcOwnerAadhaarMismatch = true;
    metadata.verificationMethod = incomingMeta.verificationMethod ?? existingMeta.verificationMethod;
  }

  return {
    kind,
    ownerName,
    aadhaarName,
    namesMatch,
    cashfreeDetails,
    metadata,
    documentVersion,
  };
}

export function applyRcManualReviewDecision(args: {
  existing: OnboardingRcDoc;
  action: "approve" | "reject";
  agentId: number;
  expectedDocumentVersion?: number | null;
  rejectionReason?: string | null;
}): {
  ok: true;
  metadata: Record<string, unknown>;
  documentVersion: number;
  previousStatus: RcVerificationState;
  newStatus: RcVerificationState;
} | {
  ok: false;
  error: "DOCUMENT_VERSION_STALE" | "NOT_PENDING" | "ALREADY_DECISIONED";
  message: string;
  currentVersion: number;
} {
  const previousStatus = resolveRcVerificationState(args.existing);
  const meta = readMeta(args.existing.metadata);
  const currentVersion = readRcDocumentVersion(meta);

  if (
    args.expectedDocumentVersion != null &&
    Number.isFinite(args.expectedDocumentVersion) &&
    args.expectedDocumentVersion !== currentVersion
  ) {
    return {
      ok: false,
      error: "DOCUMENT_VERSION_STALE",
      message:
        "This RC photo is no longer the active submission. Refresh and review the latest document.",
      currentVersion,
    };
  }

  if (previousStatus === "AUTO_VERIFIED" || previousStatus === "MANUAL_VERIFIED") {
    return {
      ok: false,
      error: "ALREADY_DECISIONED",
      message: "This RC is already verified.",
      currentVersion,
    };
  }

  if (previousStatus !== "MANUAL_REVIEW_PENDING" && args.action === "approve") {
    return {
      ok: false,
      error: "NOT_PENDING",
      message: "Only the current pending RC photo can be approved.",
      currentVersion,
    };
  }

  const now = new Date().toISOString();
  const newStatus: RcVerificationState =
    args.action === "approve" ? "MANUAL_VERIFIED" : "MANUAL_REJECTED";

  return {
    ok: true,
    documentVersion: currentVersion,
    previousStatus,
    newStatus,
    metadata: {
      ...meta,
      rcVerificationState: newStatus,
      documentVersion: currentVersion,
      activeDocumentVersion: currentVersion,
      rcReviewedAt: now,
      rcReviewedBy: args.agentId,
      rcReviewMethod: "ADMIN_MANUAL",
      ...(args.action === "reject"
        ? { rcRejectionReason: args.rejectionReason ?? null }
        : { rcRejectionReason: null }),
    },
  };
}
