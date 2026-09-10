/**
 * Pure onboarding-doc completeness used by GET /v1/rider/:id/status.
 * Dashboard approve / electronic verify must satisfy these same checks
 * so the rider app skips already-finished steps without re-submit errors.
 */

export type OnboardingDocRow = {
  id?: number;
  docType: string;
  fileUrl?: string | null;
  verified?: boolean | null;
  verificationMethod?: string | null;
  verificationStatus?: string | null;
  metadata?: unknown;
};

function readMeta(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

export function isPlaceholderOnboardingFileUrl(fileUrl?: string | null): boolean {
  const url = String(fileUrl || "").trim().toLowerCase();
  return !url || url === "pending" || url === "n/a";
}

export function isAdminOrElectronicallyCompleteDoc(
  doc?: OnboardingDocRow | null,
): boolean {
  if (!doc) return false;
  if (doc.verified === true) return true;
  const method = String(doc.verificationMethod || "").toUpperCase();
  if (
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK"
  ) {
    return true;
  }
  const status = String(doc.verificationStatus || "").toLowerCase();
  if (status === "auto_verified" || status === "verified" || status === "approved") {
    return true;
  }
  const url = String(doc.fileUrl || "").toLowerCase();
  if (
    url.includes("electronic_verified") ||
    url.includes("digilocker_verified") ||
    url.includes("aadhaar_masking_verified")
  ) {
    return true;
  }
  const meta = readMeta(doc.metadata);
  return meta.digilockerVerified === true || meta.aadhaarMaskingVerified === true;
}

/** Real upload OR dashboard/electronic complete (pending stubs do not count). */
export function isOnboardingDocUsable(doc?: OnboardingDocRow | null): boolean {
  if (!doc) return false;
  if (isAdminOrElectronicallyCompleteDoc(doc)) return true;
  return !isPlaceholderOnboardingFileUrl(doc.fileUrl);
}

function isSideApproved(metadata: unknown, side: "front" | "back"): boolean {
  const meta = readMeta(metadata);
  const raw = meta.sideVerification;
  if (!raw || typeof raw !== "object") return false;
  const entry = (raw as Record<string, { verified?: boolean; verificationStatus?: string }>)[side];
  return entry?.verified === true || entry?.verificationStatus === "approved";
}

export function aadhaarOnboardingComplete(
  docs: OnboardingDocRow[],
  filesByDocId: Map<number, { side: string | null }[]>,
): boolean {
  const row = docs.find((d) => d.docType === "aadhaar");
  const front = docs.find((d) => d.docType === "aadhaar_front");
  const back = docs.find((d) => d.docType === "aadhaar_back");

  if (row) {
    if (isAdminOrElectronicallyCompleteDoc(row)) return true;
    if (isSideApproved(row.metadata, "front") && !isSideApproved(row.metadata, "back")) {
      const files = row.id != null ? (filesByDocId.get(row.id) ?? []) : [];
      const hasBackFile = files.some((f) => (f.side || "").toLowerCase() === "back");
      // Dashboard electronic Aadhaar is front-only (back card is hidden after EV).
      if (!hasBackFile) return true;
    }
    const files = row.id != null ? (filesByDocId.get(row.id) ?? []) : [];
    const hasFront = files.some((f) => (f.side || "").toLowerCase() === "front");
    const hasBack = files.some((f) => (f.side || "").toLowerCase() === "back");
    return hasFront && hasBack;
  }

  if (isAdminOrElectronicallyCompleteDoc(front)) return true;
  return isOnboardingDocUsable(front) && isOnboardingDocUsable(back);
}

function findDlDoc(docs: OnboardingDocRow[]): OnboardingDocRow | undefined {
  return docs.find((d) => d.docType === "dl");
}

export function dlRcOnboardingComplete(docs: OnboardingDocRow[]): boolean {
  const dl = findDlDoc(docs);
  const rc = docs.find((d) => d.docType === "rc");
  if (isOnboardingDocUsable(dl) && isOnboardingDocUsable(rc)) return true;
  const dlFront = docs.find((d) => d.docType === "dl_front");
  const dlBack = docs.find((d) => d.docType === "dl_back");
  return (
    isOnboardingDocUsable(dlFront) &&
    isOnboardingDocUsable(dlBack) &&
    isOnboardingDocUsable(rc)
  );
}

/**
 * PAN + selfie step.
 * PAN is mandatory unless `panSkipOverride` is true for this rider.
 * Selfie is always required.
 */
export function panSelfieOnboardingComplete(
  docs: OnboardingDocRow[],
  opts?: { panSkipOverride?: boolean | null },
): boolean {
  const selfieOk = isOnboardingDocUsable(docs.find((d) => d.docType === "selfie"));
  if (!selfieOk) return false;
  if (opts?.panSkipOverride === true) return true;
  const pan = docs.find((d) => d.docType === "pan");
  return isAdminOrElectronicallyCompleteDoc(pan);
}

export function rentalEvOnboardingComplete(docs: OnboardingDocRow[]): boolean {
  return (
    isOnboardingDocUsable(docs.find((d) => d.docType === "rental_proof")) ||
    isOnboardingDocUsable(docs.find((d) => d.docType === "ev_proof"))
  );
}

/**
 * Admin finished vehicle docs on the rider dashboard (verified / Cashfree),
 * even if the rider never tapped Continue on vehicle selection.
 */
export function adminCompletedVehicleOnboarding(docs: OnboardingDocRow[]): boolean {
  const dl = findDlDoc(docs);
  const rc = docs.find((d) => d.docType === "rc");
  const dlFront = docs.find((d) => d.docType === "dl_front");
  const dlBack = docs.find((d) => d.docType === "dl_back");
  const dlOk =
    isAdminOrElectronicallyCompleteDoc(dl) ||
    (isAdminOrElectronicallyCompleteDoc(dlFront) &&
      isAdminOrElectronicallyCompleteDoc(dlBack));
  const rcOk = isAdminOrElectronicallyCompleteDoc(rc);
  if (dlOk && rcOk) return true;
  return (
    isAdminOrElectronicallyCompleteDoc(docs.find((d) => d.docType === "rental_proof")) ||
    isAdminOrElectronicallyCompleteDoc(docs.find((d) => d.docType === "ev_proof"))
  );
}

export function bankAccountOnboardingCompleteFromDocs(docs: OnboardingDocRow[]): boolean {
  return isAdminOrElectronicallyCompleteDoc(docs.find((d) => d.docType === "bank_proof"));
}
