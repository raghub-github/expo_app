import { getDb } from "../db/client.js";
import {
  onboardingPayments,
  riderDocumentFiles,
  riderDocuments,
  riderVehicles,
  riders,
} from "../db/schema.js";
import { desc, eq, inArray } from "drizzle-orm";

type DocumentSide = "front" | "back";

const COMPOSITE_BASE_TYPES = new Set(["aadhaar", "dl"]);

function readSideVerification(metadata: unknown): Partial<Record<DocumentSide, { verified?: boolean; verificationStatus?: string }>> {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = (metadata as Record<string, unknown>).sideVerification;
  if (!raw || typeof raw !== "object") return {};
  return raw as Partial<Record<DocumentSide, { verified?: boolean; verificationStatus?: string }>>;
}

function isSideVerified(metadata: unknown, side: DocumentSide): boolean {
  const entry = readSideVerification(metadata)[side];
  return entry?.verified === true || entry?.verificationStatus === "approved";
}

function isCompositeBaseType(docType: string): boolean {
  return COMPOSITE_BASE_TYPES.has(docType);
}

function isCompositeDocSideComplete(
  doc: { id: number; docType: string; verified?: boolean; metadata?: unknown },
  side: DocumentSide,
  filesByDocId: Map<number, { side?: string | null }[]>
): boolean {
  if (!isCompositeBaseType(doc.docType)) return false;
  const files = filesByDocId.get(doc.id) ?? [];
  const hasSide = files.some((f) => (f.side || "").toLowerCase() === side);
  if (hasSide) {
    if (isSideVerified(doc.metadata, side)) return true;
    const sv = readSideVerification(doc.metadata);
    if (Object.keys(sv).length === 0 && doc.verified) return true;
    return false;
  }
  return Boolean(doc.verified);
}

function checkIdentityDocsVerified(
  docs: { id: number; docType: string; verified?: boolean; metadata?: unknown }[],
  filesByDocId: Map<number, { side?: string | null }[]>
): boolean {
  const aadhaarRow = docs.find((d) => d.docType === "aadhaar");
  let hasAadhaar = false;
  if (aadhaarRow) {
    hasAadhaar =
      isCompositeDocSideComplete(aadhaarRow, "front", filesByDocId) &&
      isCompositeDocSideComplete(aadhaarRow, "back", filesByDocId);
  } else {
    const hasAadhaarFront = docs.some((d) => d.docType === "aadhaar_front" && d.verified);
    const hasAadhaarBack = docs.some((d) => d.docType === "aadhaar_back" && d.verified);
    const hasAadhaarSingle = docs.some((d) => d.docType === "aadhaar" && d.verified);
    hasAadhaar = (hasAadhaarFront && hasAadhaarBack) || hasAadhaarSingle;
  }

  const hasSelfie = docs.some((d) => d.docType === "selfie" && d.verified);
  const panDoc = docs.find((d) => d.docType === "pan");
  const panOk = !panDoc || Boolean(panDoc.verified);
  return hasAadhaar && hasSelfie && panOk;
}

function checkVehicleDocsVerified(
  docs: { id: number; docType: string; verified?: boolean; metadata?: unknown }[],
  vehicleType: string | null | undefined,
  filesByDocId: Map<number, { side?: string | null }[]>
): boolean {
  const dlRow = docs.find((d) => d.docType === "dl");
  let hasDL = false;
  if (dlRow) {
    hasDL =
      isCompositeDocSideComplete(dlRow, "front", filesByDocId) &&
      isCompositeDocSideComplete(dlRow, "back", filesByDocId);
  } else {
    const hasDLFront = docs.some((d) => d.docType === "dl_front" && d.verified);
    const hasDLBack = docs.some((d) => d.docType === "dl_back" && d.verified);
    const hasDLSingle = docs.some((d) => d.docType === "dl" && d.verified);
    hasDL = (hasDLFront && hasDLBack) || hasDLSingle;
  }

  const hasRC = docs.some((d) => d.docType === "rc" && d.verified);
  const hasRentalProof = docs.some((d) => d.docType === "rental_proof" && d.verified);
  const hasEVProof = docs.some((d) => d.docType === "ev_proof" && d.verified);

  if (!hasDL) return false;
  if (!hasRC && !hasRentalProof) return false;

  const isEV =
    vehicleType?.toLowerCase().includes("ev") ||
    vehicleType?.toLowerCase().includes("electric");

  if (isEV && !hasEVProof && !hasRentalProof) {
    return false;
  }

  return true;
}

async function checkOnboardingPaymentCompleted(riderId: number): Promise<boolean> {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(onboardingPayments)
    .where(eq(onboardingPayments.riderId, riderId))
    .orderBy(desc(onboardingPayments.createdAt))
    .limit(1);

  return payment?.status === "completed";
}

/** Activate rider when identity + vehicle docs are verified and onboarding fee is paid. */
export async function tryActivateRiderIfEligible(riderId: number): Promise<boolean> {
  const db = getDb();

  const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return false;
  if (rider.status === "ACTIVE" || rider.status === "BLOCKED" || rider.status === "BANNED") {
    return rider.status === "ACTIVE";
  }

  const allDocs = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  const docIds = allDocs.map((d) => d.id);
  const allFiles =
    docIds.length > 0
      ? await db
          .select({
            documentId: riderDocumentFiles.documentId,
            side: riderDocumentFiles.side,
          })
          .from(riderDocumentFiles)
          .where(inArray(riderDocumentFiles.documentId, docIds))
      : [];

  const filesByDocId = new Map<number, { side?: string | null }[]>();
  for (const f of allFiles) {
    const list = filesByDocId.get(f.documentId) ?? [];
    list.push({ side: f.side });
    filesByDocId.set(f.documentId, list);
  }

  const [vehicle] = await db
    .select()
    .from(riderVehicles)
    .where(eq(riderVehicles.riderId, riderId))
    .limit(1);

  // Identity (aadhaar + selfie) is ALWAYS required — it is KYC, not a service gate.
  const identityVerified = checkIdentityDocsVerified(allDocs, filesByDocId);
  if (!identityVerified) return false;

  // Onboarding gate.
  //
  // Policy-driven mode (§1, §6, §33): a rider may complete onboarding once they are eligible
  // for AT LEAST ONE service (which implies they hold that service's required docs) or the
  // zero-eligibility policy allows it — optional documents (e.g. DL for food) never block.
  //
  // This loosening is deliberately coupled to eligibility ENFORCEMENT (RIDER_ELIGIBILITY_MODE
  // = enforce): only then are ineligible services actually blocked at online/dispatch/accept,
  // so an under-documented rider onboarded here can never receive a service they aren't
  // eligible for. While enforcement is shadow/off we keep the LEGACY hard doc gate, so deploy
  // is a behavioural no-op and the whole system flips on one switch. Infra errors also fall
  // back to the legacy gate (never activate more permissively than before during an outage).
  let onboardingGateMet: boolean;
  try {
    const { eligibilityEnforcementMode, resolveRiderAllServiceEligibilityAtLocation } = await import(
      "../modules/rider-eligibility/riderEligibility.service.js"
    );
    if (eligibilityEnforcementMode() !== "enforce") {
      onboardingGateMet = checkVehicleDocsVerified(allDocs, vehicle?.vehicleType, filesByDocId);
    } else {
      const { allowOnboardingWithZeroEligibility } = await import(
        "../modules/rider-eligibility/onboardingEligibility.service.js"
      );
      const [loc] = await db
        .select({ state: riders.state, pincode: riders.pincode, lat: riders.lat, lon: riders.lon })
        .from(riders)
        .where(eq(riders.id, riderId))
        .limit(1);
      const { services } = await resolveRiderAllServiceEligibilityAtLocation({
        riderId,
        lat: loc?.lat ?? null,
        lng: loc?.lon ?? null,
        pincode: loc?.pincode ?? null,
        state: loc?.state ?? null,
      });
      const eligibleCount = Object.values(services).filter((s) => s.eligible).length;
      onboardingGateMet = eligibleCount > 0 || allowOnboardingWithZeroEligibility();
    }
  } catch {
    onboardingGateMet = checkVehicleDocsVerified(allDocs, vehicle?.vehicleType, filesByDocId);
  }

  if (!onboardingGateMet) return false;

  const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);
  if (!paymentCompleted) {
    await db
      .update(riders)
      .set({
        kycStatus: "APPROVED",
        onboardingStage: "PAYMENT",
        updatedAt: new Date(),
      })
      .where(eq(riders.id, riderId));

    void import("../modules/referral/referral.engine.js")
      .then(({ evaluateRiderReferralOnKycApproved }) =>
        evaluateRiderReferralOnKycApproved({ riderId }),
      )
      .catch(() => undefined);

    return false;
  }

  await db
    .update(riders)
    .set({
      kycStatus: "APPROVED",
      onboardingStage: "ACTIVE",
      status: "ACTIVE",
      updatedAt: new Date(),
    })
    .where(eq(riders.id, riderId));

  void import("../modules/referral/referral.engine.js")
    .then(({ evaluateRiderReferralOnKycApproved }) =>
      evaluateRiderReferralOnKycApproved({ riderId }),
    )
    .catch((err) =>
      console.warn("[tryActivateRiderIfEligible] referral kyc hook failed", (err as Error).message),
    );

  return true;
}
