/**
 * Dashboard display + version checks for rider RC manual review.
 * Keep in sync with backend/src/lib/rider-rc-verification-state.ts
 */

export type RcVerificationState =
  | "NOT_SUBMITTED"
  | "AUTO_VERIFICATION_PENDING"
  | "AUTO_VERIFIED"
  | "NAME_MISMATCH"
  | "MANUAL_REVIEW_PENDING"
  | "MANUAL_VERIFIED"
  | "MANUAL_REJECTED";

function readMeta(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

export function readRcDocumentVersion(metadata: unknown): number {
  const meta = readMeta(metadata);
  const raw = meta.documentVersion ?? meta.activeDocumentVersion;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export type RcReviewHistoryEntry = {
  version: number;
  status?: string;
  fileUrl?: string | null;
  r2Key?: string | null;
  uploadedAt?: string;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
  rejectionReason?: string | null;
  active?: boolean;
};

export function readRcReviewHistory(metadata: unknown): RcReviewHistoryEntry[] {
  const meta = readMeta(metadata);
  const raw = meta.rcReviewHistory;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is RcReviewHistoryEntry => Boolean(row && typeof row === "object"));
}

export function pickRcOwnerName(details: Record<string, unknown> | null | undefined): string {
  if (!details) return "";
  return String(
    details.owner || details.owner_name || details.registered_name || details.name || "",
  ).trim();
}

export function resolveRcVerificationState(doc?: {
  fileUrl?: string | null;
  verified?: boolean | null;
  verificationMethod?: string | null;
  verificationStatus?: string | null;
  metadata?: unknown;
} | null): RcVerificationState {
  if (!doc) return "NOT_SUBMITTED";
  const meta = readMeta(doc.metadata);
  const status = String(doc.verificationStatus || "").toLowerCase();
  const method = String(doc.verificationMethod || "").toUpperCase();
  const verified = doc.verified === true;
  const mismatch = meta.rcOwnerAadhaarMismatch === true;
  const explicit = meta.rcVerificationState;
  const reviewMethod = String(meta.rcReviewMethod || "").toUpperCase();
  const url = String(doc.fileUrl || "").toLowerCase();
  const hasPhoto =
    Boolean(url) &&
    url !== "pending" &&
    url !== "n/a" &&
    !url.includes("cashfree_rc_verified") &&
    url !== "electronic_verified";

  if (status === "rejected" || explicit === "MANUAL_REJECTED") return "MANUAL_REJECTED";
  if (verified) {
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
    if (status === "auto_verified" || method === "APP_VERIFIED" || method.startsWith("CASHFREE_")) {
      return "AUTO_VERIFIED";
    }
    return "MANUAL_VERIFIED";
  }
  if (explicit === "MANUAL_REVIEW_PENDING" || (mismatch && hasPhoto)) return "MANUAL_REVIEW_PENDING";
  if (explicit === "NAME_MISMATCH" || (mismatch && !hasPhoto)) return "NAME_MISMATCH";
  return "NOT_SUBMITTED";
}

export function rcDashboardStatusLabel(state: RcVerificationState): {
  status: "verified" | "pending" | "rejected" | "missing";
  statusLabel: string;
  subtitle: string;
} {
  switch (state) {
    case "AUTO_VERIFIED":
      return { status: "verified", statusLabel: "Auto verified", subtitle: "Cashfree + name match" };
    case "MANUAL_VERIFIED":
      return { status: "verified", statusLabel: "Manual verified", subtitle: "Approved by agent" };
    case "MANUAL_REVIEW_PENDING":
      return {
        status: "pending",
        statusLabel: "Pending manual verification",
        subtitle: "RC owner name did not match Aadhaar — review the photo",
      };
    case "MANUAL_REJECTED":
      return {
        status: "rejected",
        statusLabel: "Manual verification failed",
        subtitle: "Rider must upload the RC photo again",
      };
    case "NAME_MISMATCH":
      return {
        status: "pending",
        statusLabel: "RC photo required",
        subtitle: "Waiting for original RC card photo",
      };
    default:
      return { status: "missing", statusLabel: "Not submitted", subtitle: "No RC on file" };
  }
}

export function applyRcManualReviewDecision(args: {
  existing: {
    verified?: boolean | null;
    verificationMethod?: string | null;
    verificationStatus?: string | null;
    requiresManualReview?: boolean | null;
    metadata?: unknown;
    rejectedReason?: string | null;
    fileUrl?: string | null;
  };
  action: "approve" | "reject";
  agentId: number;
  expectedDocumentVersion?: number | null;
  rejectionReason?: string | null;
}):
  | {
      ok: true;
      metadata: Record<string, unknown>;
      documentVersion: number;
      previousStatus: RcVerificationState;
      newStatus: RcVerificationState;
    }
  | {
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
