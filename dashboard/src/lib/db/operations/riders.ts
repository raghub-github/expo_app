/**
 * Database Operations for Riders
 * Handles all CRUD operations for rider and document management
 */

import { getDb } from "../client";
import { riders, riderDocuments, riderVehicles, riderAddresses, riderDocumentFiles, riderPaymentMethods, onboardingPayments } from "../schema";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { getSystemUserById } from "./users";
import {
  areAllRequiredSidesApproved,
  buildSideVerificationPatch,
  isCompositeBaseType,
  isSideVerified,
  parseDisplayDocType,
  readSideVerification,
} from "@/lib/rider-document-side-verification";

/**
 * Get rider by ID
 */
export async function getRiderById(id: number) {
  const db = getDb();
  
  const [rider] = await db
    .select()
    .from(riders)
    .where(eq(riders.id, id))
    .limit(1);
  
  return rider || null;
}

/**
 * Get all documents for a rider
 */
export async function getRiderDocuments(riderId: number) {
  const db = getDb();
  
  const documents = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId))
    .orderBy(desc(riderDocuments.createdAt));
  
  return documents;
}

/**
 * Get all documents for a rider with verifier information
 */
export async function getRiderDocumentsWithVerifier(riderId: number) {
  const documents = await getRiderDocuments(riderId);
  
  // Fetch verifier information for each document
  const documentsWithVerifier = await Promise.all(
    documents.map(async (doc) => {
      let verifierName = null;
      if (doc.verifierUserId) {
        const verifier = await getSystemUserById(doc.verifierUserId);
        verifierName = verifier?.fullName || null;
      }
      return {
        ...doc,
        verifierName,
      };
    })
  );
  
  return documentsWithVerifier;
}

/**
 * Get active vehicle for a rider (if any)
 */
export async function getRiderActiveVehicle(riderId: number) {
  const db = getDb();
  const [vehicle] = await db
    .select()
    .from(riderVehicles)
    .where(and(eq(riderVehicles.riderId, riderId), eq(riderVehicles.isActive, true)))
    .limit(1);
  return vehicle || null;
}

/**
 * Get addresses for a rider (rider_addresses). Primary first, then by created_at.
 */
export async function getRiderAddresses(riderId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(riderAddresses)
    .where(eq(riderAddresses.riderId, riderId))
    .orderBy(desc(riderAddresses.isPrimary), desc(riderAddresses.createdAt));
  return rows;
}

/**
 * Get document files by document IDs (for multi-file docs: front/back, etc.)
 */
export async function getRiderDocumentFilesByDocumentIds(documentIds: number[]) {
  if (documentIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(riderDocumentFiles)
    .where(inArray(riderDocumentFiles.documentId, documentIds))
    .orderBy(riderDocumentFiles.documentId, riderDocumentFiles.sortOrder, riderDocumentFiles.id);
}

/**
 * Get payment methods for a rider (bank/UPI; exclude soft-deleted)
 */
export async function getRiderPaymentMethods(riderId: number) {
  const db = getDb();
  return db
    .select()
    .from(riderPaymentMethods)
    .where(and(eq(riderPaymentMethods.riderId, riderId), isNull(riderPaymentMethods.deletedAt)))
    .orderBy(desc(riderPaymentMethods.createdAt));
}

/**
 * Get rider with all documents (with files), active vehicle, addresses, and payment methods
 */
export async function getRiderWithDocuments(id: number) {
  const rider = await getRiderById(id);
  if (!rider) {
    return null;
  }

  const [documents, vehicle, addresses, paymentMethods] = await Promise.all([
    getRiderDocumentsWithVerifier(id),
    getRiderActiveVehicle(id),
    getRiderAddresses(id),
    getRiderPaymentMethods(id),
  ]);

  const docIds = documents.map((d) => d.id);
  const allFiles = await getRiderDocumentFilesByDocumentIds(docIds);
  const filesByDocId = new Map<number, typeof allFiles>();
  for (const f of allFiles) {
    const list = filesByDocId.get(f.documentId) || [];
    list.push(f);
    filesByDocId.set(f.documentId, list);
  }

  const documentsWithFiles = documents.map((doc) => ({
    ...doc,
    files: filesByDocId.get(doc.id) || [],
  }));

  return {
    rider,
    documents: documentsWithFiles,
    vehicle,
    addresses,
    paymentMethods,
  };
}

/**
 * Get document by ID
 */
export async function getRiderDocumentById(docId: number) {
  const db = getDb();
  
  const [document] = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.id, docId))
    .limit(1);
  
  return document || null;
}

/**
 * Update rider document
 */
export async function updateRiderDocument(
  docId: number,
  updates: {
    docNumber?: string | null;
    fileUrl?: string;
    r2Key?: string;
    metadata?: Record<string, any>;
  }
) {
  const db = getDb();
  
  const [updated] = await db
    .update(riderDocuments)
    .set({
      ...updates,
      ...(updates.metadata && { metadata: updates.metadata }),
    })
    .where(eq(riderDocuments.id, docId))
    .returning();
  
  return updated || null;
}

/**
 * Update rider KYC + onboarding stage in one DB round-trip (faster than two separate updates).
 */
export async function updateRiderKycAndStage(
  riderId: number,
  kycStatus: "APPROVED",
  stage: "APPROVAL"
) {
  const db = getDb();
  const [updated] = await db
    .update(riders)
    .set({
      kycStatus: kycStatus as any,
      onboardingStage: stage as any,
      updatedAt: new Date(),
    })
    .where(eq(riders.id, riderId))
    .returning();
  return updated || null;
}

/**
 * Approve rider document (whole doc or one front/back side). Returns approved doc + final rider state.
 */
export async function approveRiderDocument(
  docId: number,
  agentId: number,
  options?: { displayDocType?: string }
): Promise<{
  approved: Record<string, unknown>;
  riderState: { kycStatus: string; onboardingStage: string; status: string };
  displayDocType?: string;
  sideVerified?: boolean;
} | null> {
  const db = getDb();

  const [current] = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.id, docId))
    .limit(1);

  if (!current) return null;

  const parsed = parseDisplayDocType(options?.displayDocType);
  const isSideApproval =
    parsed &&
    parsed.side &&
    isCompositeBaseType(current.docType) &&
    parsed.baseType === current.docType;

  let approved: typeof current;

  if (isSideApproval && parsed!.side) {
    const side = parsed!.side;
    const files = await getRiderDocumentFilesByDocumentIds([docId]);
    const nextMetadata = buildSideVerificationPatch(current.metadata, side, {
      verified: true,
      verificationStatus: "approved",
      verifiedAt: new Date().toISOString(),
      verifierUserId: agentId,
      rejectedReason: null,
    });
    const allSidesApproved = areAllRequiredSidesApproved(nextMetadata, files);

    const [updated] = await db
      .update(riderDocuments)
      .set({
        metadata: nextMetadata,
        verified: allSidesApproved,
        verificationStatus: allSidesApproved ? "approved" : "pending",
        verifiedAt: allSidesApproved ? new Date() : null,
        verifierUserId: allSidesApproved ? agentId : current.verifierUserId,
        rejectedReason: allSidesApproved ? null : current.rejectedReason,
        updatedAt: new Date(),
      })
      .where(eq(riderDocuments.id, docId))
      .returning();

    if (!updated) return null;
    approved = updated;

    const riderState = await recomputeRiderStateAfterDocChange(approved.riderId);
    return {
      approved,
      riderState,
      displayDocType: options?.displayDocType,
      sideVerified: true,
    };
  }

  // Whole-document approval (single-side docs or legacy flow)
  const [wholeApproved] = await db
    .update(riderDocuments)
    .set({
      verified: true,
      verificationStatus: "approved",
      verifiedAt: new Date(),
      verifierUserId: agentId,
      rejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(riderDocuments.id, docId))
    .returning();

  if (!wholeApproved) return null;
  approved = wholeApproved;

  const riderState = await recomputeRiderStateAfterDocChange(approved.riderId);
  return { approved, riderState };
}

async function recomputeRiderStateAfterDocChange(riderId: number): Promise<{
  kycStatus: string;
  onboardingStage: string;
  status: string;
}> {
  const db = getDb();
  const rider = await getRiderById(riderId);
  const fallbackState = {
    kycStatus: (rider as any)?.kycStatus ?? "PENDING",
    onboardingStage: (rider as any)?.onboardingStage ?? "MOBILE_VERIFIED",
    status: (rider as any)?.status ?? "INACTIVE",
  };
  if (!rider) return fallbackState;

  const allDocs = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  const docIds = allDocs.map((d) => d.id);
  const allFiles = await getRiderDocumentFilesByDocumentIds(docIds);
  const filesByDocId = new Map<number, typeof allFiles>();
  for (const f of allFiles) {
    const list = filesByDocId.get(f.documentId) || [];
    list.push(f);
    filesByDocId.set(f.documentId, list);
  }

  const vehicles = await db
    .select()
    .from(riderVehicles)
    .where(eq(riderVehicles.riderId, riderId))
    .limit(1);

  const vehicle = vehicles[0];

  const identityVerified = checkIdentityDocsVerifiedFromList(allDocs, filesByDocId);
  const vehicleDocsVerified = checkVehicleDocsVerifiedFromList(allDocs, vehicle?.vehicleType, filesByDocId);
  // bank_proof is optional (additional doc); identity + vehicle docs are required for activation
  const allRequiredDocsVerified = identityVerified && vehicleDocsVerified;

  let kycStatus = (rider as any).kycStatus;
  let onboardingStage = (rider as any).onboardingStage;
  let status = (rider as any).status;

  if (identityVerified && kycStatus === "PENDING") {
    kycStatus = "APPROVED";
    onboardingStage = "APPROVAL";
    await db
      .update(riders)
      .set({
        kycStatus: kycStatus as any,
        onboardingStage: onboardingStage as any,
        updatedAt: new Date(),
      })
      .where(eq(riders.id, riderId));
  }

  if (allRequiredDocsVerified) {
    const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);

    if (paymentCompleted) {
      status = "ACTIVE";
      onboardingStage = "ACTIVE";
      await db
        .update(riders)
        .set({
          kycStatus: "APPROVED" as any,
          onboardingStage: "ACTIVE" as any,
          status: "ACTIVE" as any,
          updatedAt: new Date(),
        })
        .where(eq(riders.id, riderId));

      return { kycStatus: "APPROVED", onboardingStage: "ACTIVE", status: "ACTIVE" };
    }

    onboardingStage = "PAYMENT";
    kycStatus = "APPROVED";
    await db
      .update(riders)
      .set({
        kycStatus: "APPROVED" as any,
        onboardingStage: "PAYMENT" as any,
        updatedAt: new Date(),
      })
      .where(eq(riders.id, riderId));
  }

  return { kycStatus, onboardingStage, status };
}

/** Re-evaluate rider KYC/onboarding stage/status after docs or payment change. */
export async function syncRiderOnboardingState(riderId: number): Promise<{
  kycStatus: string;
  onboardingStage: string;
  status: string;
}> {
  return recomputeRiderStateAfterDocChange(riderId);
}

// Helper function to check identity docs from list
function isCompositeDocSideComplete(
  doc: { docType: string; verified?: boolean; metadata?: unknown },
  side: "front" | "back",
  filesByDocId: Map<number, { side?: string | null }[]>
): boolean {
  if (!isCompositeBaseType(doc.docType)) return false;
  const files = filesByDocId.get((doc as any).id) ?? [];
  const hasSide = files.some((f) => (f.side || "").toLowerCase() === side);
  if (hasSide) {
    if (isSideVerified(doc.metadata, side)) return true;
    const sv = readSideVerification(doc.metadata);
    if (Object.keys(sv).length === 0 && doc.verified) return true;
    return false;
  }
  return Boolean(doc.verified);
}

function checkIdentityDocsVerifiedFromList(
  docs: any[],
  filesByDocId: Map<number, { side?: string | null }[]> = new Map()
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
  const hasPan = docs.some((d) => d.docType === "pan" && d.verified);

  return hasAadhaar && hasSelfie && hasPan;
}

// Helper function to check vehicle docs from list
function checkVehicleDocsVerifiedFromList(
  docs: any[],
  vehicleType?: string,
  filesByDocId: Map<number, { side?: string | null }[]> = new Map()
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

/**
 * Reject rider document (whole doc or one front/back side)
 */
export async function rejectRiderDocument(
  docId: number,
  agentId: number,
  reason: string,
  options?: { displayDocType?: string }
) {
  const db = getDb();

  const [current] = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.id, docId))
    .limit(1);

  if (!current) return null;

  const parsed = parseDisplayDocType(options?.displayDocType);
  const isSideRejection =
    parsed &&
    parsed.side &&
    isCompositeBaseType(current.docType) &&
    parsed.baseType === current.docType;

  let rejected: typeof current;

  if (isSideRejection && parsed!.side) {
    const side = parsed!.side;
    const nextMetadata = buildSideVerificationPatch(current.metadata, side, {
      verified: false,
      verificationStatus: "rejected",
      verifiedAt: null,
      verifierUserId: agentId,
      rejectedReason: reason,
    });

    const [updated] = await db
      .update(riderDocuments)
      .set({
        metadata: nextMetadata,
        verified: false,
        verificationStatus: "pending",
        verifiedAt: null,
        verifierUserId: agentId,
        rejectedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(riderDocuments.id, docId))
      .returning();

    rejected = updated!;
  } else {
    const [wholeRejected] = await db
      .update(riderDocuments)
      .set({
        verified: false,
        verificationStatus: "rejected",
        verifierUserId: agentId,
        rejectedReason: reason,
        verifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(riderDocuments.id, docId))
      .returning();

    rejected = wholeRejected!;
  }

  if (rejected) {
    const riderId = rejected.riderId;
    const docType = rejected.docType;
    const criticalDocs = ["aadhaar", "aadhaar_front", "pan", "selfie"];
    const displayCritical =
      options?.displayDocType &&
      ["aadhaar_front", "aadhaar_back", "pan", "selfie"].includes(options.displayDocType);
    if (criticalDocs.includes(docType) || displayCritical) {
      await db
        .update(riders)
        .set({
          kycStatus: "REJECTED" as any,
          updatedAt: new Date(),
        })
        .where(eq(riders.id, riderId));
    }
  }

  return rejected || null;
}

/**
 * Update rider KYC status
 */
export async function updateRiderKycStatus(
  riderId: number,
  kycStatus: "PENDING" | "REJECTED" | "APPROVED" | "REVIEW"
) {
  const db = getDb();
  
  const [updated] = await db
    .update(riders)
    .set({
      kycStatus: kycStatus as any,
      updatedAt: new Date(),
    })
    .where(eq(riders.id, riderId))
    .returning();
  
  return updated || null;
}

/**
 * Update rider onboarding stage
 */
export async function updateRiderOnboardingStage(
  riderId: number,
  stage: "MOBILE_VERIFIED" | "KYC" | "PAYMENT" | "APPROVAL" | "ACTIVE"
) {
  const db = getDb();
  
  const updateData: any = {
    onboardingStage: stage as any,
    updatedAt: new Date(),
  };
  
  // If moving to ACTIVE, also update rider status to ACTIVE
  if (stage === "ACTIVE") {
    updateData.status = "ACTIVE" as any;
  }
  
  const [updated] = await db
    .update(riders)
    .set(updateData)
    .where(eq(riders.id, riderId))
    .returning();
  
  return updated || null;
}

/**
 * Check if onboarding payment is completed
 */
export async function checkOnboardingPaymentCompleted(riderId: number): Promise<boolean> {
  const db = getDb();
  
  const [payment] = await db
    .select()
    .from(onboardingPayments)
    .where(eq(onboardingPayments.riderId, riderId))
    .orderBy(desc(onboardingPayments.createdAt))
    .limit(1);
  
  return payment?.status === 'completed';
}

/**
 * Check if identity documents only are verified (aadhaar + selfie; PAN optional).
 * Used to set onboarding_stage = KYC and kyc_status = APPROVED when identity docs are done
 * but vehicle docs are not yet verified.
 */
export async function checkIdentityDocumentsVerified(riderId: number): Promise<boolean> {
  const documents = await getRiderDocuments(riderId);
  const appVerified = documents.filter((d) => d.verificationMethod === "APP_VERIFIED");
  const manualVerified = documents.filter((d) => d.verificationMethod === "MANUAL_UPLOAD" && d.verified);
  const verifiedTypes = new Set([...appVerified, ...manualVerified].map((d) => d.docType));
  const hasAadhaar = verifiedTypes.has("aadhaar");
  const hasSelfie = verifiedTypes.has("selfie");
  return hasAadhaar && hasSelfie;
}

/**
 * Check if all required documents are verified for a rider
 * Enhanced to handle EV/Petrol vehicle scenarios and make PAN optional
 * 
 * @param riderId - Rider ID
 * @param vehicleChoice - Optional: 'EV' or 'Petrol' (if not provided, will try to infer from documents)
 * @returns boolean - true if all required documents are verified
 */
export async function checkAllRequiredDocumentsVerified(
  riderId: number, 
  vehicleChoice?: 'EV' | 'Petrol'
): Promise<boolean> {
  const documents = await getRiderDocuments(riderId);
  const rider = await getRiderById(riderId);
  
  // Aadhaar is always mandatory
  // PAN is optional
  // Selfie is always required
  const mandatoryTypes = ["aadhaar", "selfie"] as const;
  
  // Determine vehicle choice if not provided
  let vehicleType = vehicleChoice;

  // 1) Prefer explicit rider.vehicleChoice if present ('EV' or 'Petrol')
  if (!vehicleType && rider && typeof (rider as any).vehicleChoice === 'string') {
    const choice = ((rider as any).vehicleChoice as string).toUpperCase();
    if (choice === 'EV' || choice === 'PETROL') {
      vehicleType = choice as 'EV' | 'Petrol';
    }
  }

  // 2) If still unknown, infer from verified documents
  if (!vehicleType) {
    // Check if rider has RC/DL (Petrol) or rental_proof/ev_proof (EV)
    const hasRcOrDl = documents.some(doc => 
      (doc.docType === 'rc' || doc.docType === 'dl') && 
      (doc.verificationMethod === 'APP_VERIFIED' || doc.verified)
    );
    const hasRentalOrEvProof = documents.some(doc => 
      (doc.docType === 'rental_proof' || doc.docType === 'ev_proof') && 
      (doc.verificationMethod === 'APP_VERIFIED' || doc.verified)
    );
    
    if (hasRentalOrEvProof && !hasRcOrDl) {
      // Strong EV signal (rental/EV proof without petrol docs)
      vehicleType = 'EV';
    } else if (hasRcOrDl) {
      // RC/DL present → treat as Petrol / ICE (bike, car, etc.)
      vehicleType = 'Petrol';
    }
    // If we still cannot determine, we will fall back to Petrol rules below,
    // which are the strictest (require both RC and DL).
  }
  
  // Get all documents (both APP_VERIFIED and MANUAL_UPLOAD)
  // APP_VERIFIED documents are already verified, so we check if they exist
  // MANUAL_UPLOAD documents need to be verified by agent
  const appVerifiedDocs = documents.filter(
    (doc) => doc.verificationMethod === "APP_VERIFIED"
  );
  
  const manualVerifiedDocs = documents.filter(
    (doc) => doc.verificationMethod === "MANUAL_UPLOAD" && doc.verified
  );
  
  // Combine both types
  const allVerifiedDocs = [...appVerifiedDocs, ...manualVerifiedDocs];
  const verifiedTypes = new Set(allVerifiedDocs.map((doc) => doc.docType));
  
  // Check mandatory documents
  const hasMandatory = mandatoryTypes.every((type) => verifiedTypes.has(type));
  if (!hasMandatory) {
    return false;
  }
  
  // Vehicle-specific requirements
  if (vehicleType === 'EV') {
    // EV bike: Either RC+DL OR rental_proof/ev_proof
    const hasRcAndDl = verifiedTypes.has('rc') && verifiedTypes.has('dl');
    const hasRentalOrEvProof = verifiedTypes.has('rental_proof') || verifiedTypes.has('ev_proof');
    
    if (hasRcAndDl) {
      // Has RC and DL - all good
      return true;
    } else if (hasRentalOrEvProof) {
      // Has rental/EV proof but no RC/DL - acceptable for EV
      return true;
    } else {
      // EV but no RC/DL and no rental/EV proof - incomplete
      return false;
    }
  } else {
    // Petrol bike: Must have RC and DL
    const hasRc = verifiedTypes.has('rc');
    const hasDl = verifiedTypes.has('dl');
    
    if (!hasRc || !hasDl) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if onboarding is complete (documents + payment + approval).
 * Optional rider param avoids an extra getRiderById when caller already has current rider.
 */
export async function checkOnboardingComplete(
  riderId: number,
  riderOverride?: { kycStatus: string; onboardingStage: string; status?: string } | null
): Promise<{ isComplete: boolean; missingSteps: string[] }> {
  const rider = riderOverride ?? (await getRiderById(riderId));
  if (!rider) {
    return { isComplete: false, missingSteps: ['Rider not found'] };
  }

  const missingSteps: string[] = [];

  const documentsVerified = await checkAllRequiredDocumentsVerified(riderId);
  if (!documentsVerified) missingSteps.push('Documents not verified');

  const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);
  if (!paymentCompleted) missingSteps.push('Payment not completed');

  if (rider.kycStatus !== 'APPROVED') missingSteps.push('KYC not approved');
  if (rider.onboardingStage !== 'APPROVAL' && rider.onboardingStage !== 'ACTIVE') {
    missingSteps.push('Onboarding stage not in APPROVAL/ACTIVE');
  }

  return { isComplete: missingSteps.length === 0, missingSteps };
}

/**
 * Get latest document of a specific type for a rider
 */
export async function getLatestDocumentByType(
  riderId: number,
  docType: string
) {
  const db = getDb();
  
  const [document] = await db
    .select()
    .from(riderDocuments)
    .where(
      and(
        eq(riderDocuments.riderId, riderId),
        eq(riderDocuments.docType, docType as any)
      )
    )
    .orderBy(desc(riderDocuments.createdAt))
    .limit(1);
  
  return document || null;
}
