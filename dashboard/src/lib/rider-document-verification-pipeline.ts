/**
 * Canonical rider-document verification pipeline (dashboard).
 *
 * ALL document types share the same post-mutation contract:
 *   ADMIN MANUAL VERIFY/REJECT
 *     → canonical rider_documents status/metadata
 *     → document-type downstream projections (vehicle / bank / …)
 *     → rider KYC / onboarding aggregate recompute
 *     → pending-document calculation consumers read fresh DB state
 *
 * Canonical verified state (source of truth on rider_documents):
 *   verified = true
 *   verification_status ∈ { approved, auto_verified }
 * Manual vs auto differs only in verification_method + verifier metadata.
 */

export type DocVerificationAction = "approve" | "reject";

export type PipelineDocSnapshot = {
  id: number;
  riderId: number;
  docType: string;
  verified?: boolean | null;
  verificationStatus?: string | null;
  verificationMethod?: string | null;
  requiresManualReview?: boolean | null;
  fileUrl?: string | null;
  r2Key?: string | null;
  docNumber?: string | null;
  vehicleId?: number | null;
  rejectedReason?: string | null;
  updatedAt?: Date | string | null;
};

export type PendingManualDocument = {
  id: number;
  docType: string;
  label: string;
  verificationStatus: string;
  updatedAt: string | null;
};

export type VehiclePendingInput = {
  id: number;
  registrationNumber: string | null;
  verified: boolean | null;
  vehicleActiveStatus: string | null;
  updatedAt: Date | string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  dl: "Driving Licence",
  dl_front: "Driving Licence",
  dl_back: "Driving Licence (back)",
  rc: "Registration Certificate",
  aadhaar: "Aadhaar",
  aadhaar_front: "Aadhaar",
  aadhaar_back: "Aadhaar (back)",
  pan: "PAN",
  selfie: "Selfie",
  profile_photo: "Profile photo",
  rental_proof: "Rental proof",
  ev_proof: "EV proof",
  ev_ownership_proof: "EV ownership proof",
  insurance: "Insurance",
  bank_proof: "Bank proof",
  vehicle_image: "Vehicle image",
  upi_qr_proof: "UPI QR proof",
};

const SKIP_PENDING_DOC_TYPES = new Set([
  "onboarding_vehicle_selection",
  "onboarding_work_location",
  "other",
  "upi_qr_proof",
]);

/** Doc types whose reject should hard-flag KYC as REJECTED for non-ACTIVE riders. */
export const CRITICAL_IDENTITY_DOC_TYPES = new Set([
  "aadhaar",
  "aadhaar_front",
  "aadhaar_back",
  "pan",
  "selfie",
  "profile_photo",
  "dl",
  "dl_front",
  "dl_back",
]);

export function normalizeDocType(docType: string | null | undefined): string {
  return String(docType || "")
    .trim()
    .toLowerCase();
}

export function docFamily(docType: string): string {
  return normalizeDocType(docType).replace(/_front$|_back$/, "");
}

export function labelForDocType(docType: string): string {
  const type = normalizeDocType(docType);
  return DOC_TYPE_LABELS[type] || type.replace(/_/g, " ").toUpperCase() || "Document";
}

export function isElectronicallyVerifiedMethod(method: string | null | undefined): boolean {
  const m = String(method || "").toUpperCase();
  return m === "APP_VERIFIED" || m.startsWith("CASHFREE_") || m === "RAZORPAY_BANK";
}

/**
 * Authoritative "this document is verified" check used by aggregates + pending calc.
 * Does NOT invent a parallel status field — reads verified + verification_status.
 */
export function isCanonicallyVerified(doc: {
  verified?: boolean | null;
  verificationStatus?: string | null;
}): boolean {
  if (doc.verified === true) return true;
  const status = String(doc.verificationStatus || "").toLowerCase();
  return status === "approved" || status === "auto_verified";
}

export function isRejectedDoc(doc: {
  verificationStatus?: string | null;
  rejectedReason?: string | null;
}): boolean {
  const status = String(doc.verificationStatus || "").toLowerCase();
  if (status === "rejected") return true;
  return Boolean(doc.rejectedReason);
}

export function hasRealUploadedFile(doc: {
  fileUrl?: string | null;
  r2Key?: string | null;
}): boolean {
  const fileUrl = String(doc.fileUrl || "").trim();
  const r2Key = String(doc.r2Key || "").trim();
  if (r2Key) return true;
  if (!fileUrl) return false;
  const lower = fileUrl.toLowerCase();
  if (lower === "pending" || lower.endsWith("/pending")) return false;
  if (lower.startsWith("placeholder")) return false;
  if (lower.startsWith("cashfree_")) return false;
  if (lower.startsWith("digilocker_")) return false;
  if (lower === "electronic_verified" || lower.includes("electronic_verified")) return true;
  if (lower === "n/a") return false;
  return true;
}

/** True when an uploaded doc still needs agent review (pending banner / DOCS PENDING). */
export function isAwaitingManualReview(doc: PipelineDocSnapshot): boolean {
  const type = normalizeDocType(doc.docType);
  if (SKIP_PENDING_DOC_TYPES.has(type)) return false;
  if (isCanonicallyVerified(doc)) return false;
  if (isRejectedDoc(doc)) return false;
  if (!hasRealUploadedFile(doc)) return false;

  const status = String(doc.verificationStatus || "").toLowerCase();
  const method = String(doc.verificationMethod || "").toUpperCase();
  const isManual =
    method === "MANUAL_UPLOAD" ||
    doc.requiresManualReview === true ||
    status === "pending" ||
    status === "";
  return isManual && (status === "pending" || status === "" || doc.requiresManualReview === true);
}

/** Fields written on every successful non-electronic (manual) whole-doc / completed-side approve. */
export function buildManualApproveFields(agentId: number, now = new Date()) {
  return {
    verified: true as const,
    verificationStatus: "approved" as const,
    verificationMethod: "MANUAL_UPLOAD" as const,
    verifiedAt: now,
    verifierUserId: agentId,
    verifiedBy: agentId,
    rejectedReason: null as string | null,
    requiresManualReview: false as const,
    updatedAt: now,
  };
}

/** Fields written on every whole-doc reject. */
export function buildManualRejectFields(
  agentId: number,
  reason: string,
  now = new Date(),
) {
  return {
    verified: false as const,
    verificationStatus: "rejected" as const,
    verifierUserId: agentId,
    verifiedBy: agentId,
    rejectedReason: reason,
    verifiedAt: null as Date | null,
    requiresManualReview: true as const,
    updatedAt: now,
  };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizePlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return v.length >= 4 ? v : null;
}

/**
 * Compute pending-manual documents for banners / KYC / DOCS PENDING.
 * Document rows are authoritative; unverified vehicles only surface when no
 * matching verified RC document exists (prevents stale "RC pending" after manual verify).
 */
export function computePendingManualDocuments(params: {
  documents: PipelineDocSnapshot[];
  vehicles?: VehiclePendingInput[];
}): PendingManualDocument[] {
  const pendingFromDocs = params.documents
    .filter((row) => isAwaitingManualReview(row))
    .map((row) => {
      const type = normalizeDocType(row.docType);
      return {
        id: row.id,
        docType: type,
        label: labelForDocType(type),
        verificationStatus: String(row.verificationStatus || "pending"),
        updatedAt: toIso(row.updatedAt),
      };
    });

  const pendingByFamily = new Map<string, PendingManualDocument>();
  for (const doc of pendingFromDocs) {
    const family = docFamily(doc.docType);
    if (!pendingByFamily.has(family)) {
      pendingByFamily.set(family, {
        ...doc,
        docType: family,
        label: labelForDocType(family),
      });
    }
  }

  const verifiedRcDocs = params.documents.filter(
    (d) => normalizeDocType(d.docType) === "rc" && isCanonicallyVerified(d),
  );
  const verifiedRcPlates = new Set(
    verifiedRcDocs
      .map((d) => normalizePlate(d.docNumber))
      .filter((p): p is string => Boolean(p)),
  );
  const verifiedRcVehicleIds = new Set(
    verifiedRcDocs
      .map((d) => d.vehicleId)
      .filter((id): id is number => typeof id === "number" && id > 0),
  );
  const anyVerifiedRc = verifiedRcDocs.length > 0;

  for (const v of params.vehicles ?? []) {
    const status = String(v.vehicleActiveStatus || "").toLowerCase();
    if (status === "retired" || status === "replaced" || status === "deleted") continue;
    if (v.verified === true) continue;

    // Verified RC document wins over stale rider_vehicles.verified=false.
    if (verifiedRcVehicleIds.has(v.id)) continue;
    const plate = normalizePlate(v.registrationNumber);
    if (plate && verifiedRcPlates.has(plate)) continue;
    // Single-vehicle / legacy: any verified RC covers the fleet row.
    if (anyVerifiedRc && (params.vehicles?.length ?? 0) <= 1) continue;

    const key = `rc_vehicle_${v.id}`;
    if (pendingByFamily.has("rc") || pendingByFamily.has(key)) continue;
    pendingByFamily.set(key, {
      id: v.id,
      docType: "rc",
      label: plate ? `RC (${plate})` : "Registration Certificate",
      verificationStatus: "pending",
      updatedAt: toIso(v.updatedAt),
    });
  }

  return [...pendingByFamily.values()];
}

export function logDocVerify(payload: Record<string, unknown>): void {
  console.info("[DOC_VERIFY]", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function logDocAggregate(payload: Record<string, unknown>): void {
  console.info("[DOC_AGGREGATE]", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function logDocPending(payload: Record<string, unknown>): void {
  console.info("[DOC_PENDING]", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function logDocCache(payload: Record<string, unknown>): void {
  console.info("[DOC_CACHE]", {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}
