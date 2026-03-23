/**
 * Database Operations for Riders
 * Handles all CRUD operations for rider and document management
 */

import { getDb } from "../client";
import { riders, riderDocuments, riderVehicles, riderAddresses, riderDocumentFiles, riderPaymentMethods, onboardingPayments } from "../schema";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { getSystemUserById } from "./users";

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
 * Approve rider document. Returns approved doc + final rider state for instant UI update.
 */
export async function approveRiderDocument(
  docId: number,
  agentId: number
): Promise<{ approved: Record<string, unknown>; riderState: { kycStatus: string; onboardingStage: string; status: string } } | null> {
  const db = getDb();

  // Update document with verification details
  const [approved] = await db
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

  if (!approved) return null;

  const riderId = approved.riderId as number;
  const rider = await getRiderById(riderId);
  const fallbackState = { kycStatus: (rider as any)?.kycStatus ?? "PENDING", onboardingStage: (rider as any)?.onboardingStage ?? "MOBILE_VERIFIED", status: (rider as any)?.status ?? "INACTIVE" };
  if (!rider) return { approved, riderState: fallbackState };

  // Get all documents and vehicle info for complete verification check
  const allDocs = await db
    .select()
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  const vehicles = await db
    .select()
    .from(riderVehicles)
    .where(eq(riderVehicles.riderId, riderId))
    .limit(1);

  const vehicle = vehicles[0];

  // Check verification states
  const identityVerified = checkIdentityDocsVerifiedFromList(allDocs);
  const vehicleDocsVerified = checkVehicleDocsVerifiedFromList(allDocs, vehicle?.vehicleType);
  const bankProofVerified = allDocs.some((d: any) => d.docType === 'bank_proof' && d.verified);
  const allRequiredDocsVerified = identityVerified && vehicleDocsVerified && bankProofVerified;

  let kycStatus = (rider as any).kycStatus;
  let onboardingStage = (rider as any).onboardingStage;
  let status = (rider as any).status;

  // Onboarding flow: MOBILE_VERIFIED → KYC → APPROVAL (docs) → PAYMENT (fees) → ACTIVE
  // Enum: MOBILE_VERIFIED | KYC | PAYMENT | APPROVAL | ACTIVE
  //
  // Stage 1: Identity docs verified (Aadhaar, PAN, selfie) → KYC approved, move to APPROVAL
  //         (APPROVAL = docs approval phase: still verifying DL, RC, bank etc.)
  if (identityVerified && kycStatus === "PENDING") {
    kycStatus = "APPROVED";
    onboardingStage = "APPROVAL";
    await db.update(riders).set({
      kycStatus: kycStatus as any,
      onboardingStage: onboardingStage as any,
      updatedAt: new Date(),
    }).where(eq(riders.id, riderId));
  }

  // Stage 2: All required documents verified (identity + vehicle + bank)
  //         → If rider already paid fees → ACTIVE (auto-approve)
  //         → Else → PAYMENT (waiting for onboarding fees)
  if (allRequiredDocsVerified) {
    const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);

    if (paymentCompleted) {
      // All docs verified + payment done → ACTIVE
      status = "ACTIVE";
      onboardingStage = "ACTIVE";
      await db.update(riders).set({
        kycStatus: "APPROVED" as any,
        onboardingStage: "ACTIVE" as any,
        status: "ACTIVE" as any,
        updatedAt: new Date(),
      }).where(eq(riders.id, riderId));

      return { approved, riderState: { kycStatus: "APPROVED", onboardingStage: "ACTIVE", status: "ACTIVE" } };
    }

    // All docs verified but payment not done → PAYMENT stage (waiting for fees)
    onboardingStage = "PAYMENT";
    kycStatus = "APPROVED";
    await db.update(riders).set({
      kycStatus: "APPROVED" as any,
      onboardingStage: "PAYMENT" as any,
      updatedAt: new Date(),
    }).where(eq(riders.id, riderId));
  }

  return { approved, riderState: { kycStatus, onboardingStage, status } };
}

// Helper function to check identity docs from list
function checkIdentityDocsVerifiedFromList(docs: any[]): boolean {
  // Aadhaar: front OR back is enough (but preferably both)
  const hasAadhaarFront = docs.some(d => d.docType === 'aadhaar_front' && d.verified);
  const hasAadhaarBack = docs.some(d => d.docType === 'aadhaar_back' && d.verified);
  const hasAadhaarSingle = docs.some(d => d.docType === 'aadhaar' && d.verified);
  const hasAadhaar = hasAadhaarFront || hasAadhaarBack || hasAadhaarSingle;
  
  const hasSelfie = docs.some(d => d.docType === 'selfie' && d.verified);
  const hasPan = docs.some(d => d.docType === 'pan' && d.verified);
  
  return hasAadhaar && hasSelfie && hasPan;
}

// Helper function to check vehicle docs from list
function checkVehicleDocsVerifiedFromList(docs: any[], vehicleType?: string): boolean {
  // DL: front OR back is enough (but preferably both)
  const hasDLFront = docs.some(d => d.docType === 'dl_front' && d.verified);
  const hasDLBack = docs.some(d => d.docType === 'dl_back' && d.verified);
  const hasDLSingle = docs.some(d => d.docType === 'dl' && d.verified);
  const hasDL = hasDLFront || hasDLBack || hasDLSingle;
  
  const hasRC = docs.some(d => d.docType === 'rc' && d.verified);
  const hasRentalProof = docs.some(d => d.docType === 'rental_proof' && d.verified);
  const hasEVProof = docs.some(d => d.docType === 'ev_proof' && d.verified);
  
  // DL is always required
  if (!hasDL) return false;
  
  // RC or Rental Proof required (at least one)
  if (!hasRC && !hasRentalProof) return false;
  
  // For EV vehicles, EV proof is also required (or rental proof covers it)
  const isEV = vehicleType?.toLowerCase().includes('ev') || 
               vehicleType?.toLowerCase().includes('electric');
  
  if (isEV && !hasEVProof && !hasRentalProof) {
    return false;
  }
  
  return true;
}

/**
 * Reject rider document
 */
export async function rejectRiderDocument(
  docId: number,
  agentId: number,
  reason: string
) {
  const db = getDb();
  
  const [rejected] = await db
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
  
  // Update rider KYC status to PENDING or REJECTED if identity docs are rejected
  if (rejected) {
    const riderId = (rejected as any).riderId;
    const docType = (rejected as any).docType;
    
    // If critical identity documents are rejected, update KYC status
    const criticalDocs = ['aadhaar', 'aadhaar_front', 'pan', 'selfie'];
    if (criticalDocs.includes(docType)) {
      await db.update(riders).set({
        kycStatus: "REJECTED" as any,
        updatedAt: new Date(),
      }).where(eq(riders.id, riderId));
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
