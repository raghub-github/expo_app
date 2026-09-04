/**
 * Database Operations for Riders
 * Handles all CRUD operations for rider and document management
 */

import { getDb } from "../client";
import { riders, riderDocuments, riderVehicles, riderAddresses, riderDocumentFiles, riderPaymentMethods, onboardingPayments } from "../schema";
import { eq, and, desc, inArray, isNull, ne, notInArray, sql, count } from "drizzle-orm";
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
 * Prefer syncRiderOnboardingState / stage machine — do not use to jump unpaid riders to APPROVAL.
 */
export async function updateRiderKycAndStage(
  riderId: number,
  kycStatus: "APPROVED",
  stage: "PAYMENT" | "APPROVAL" | "KYC"
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
  options?: {
    displayDocType?: string;
    electronicVerify?: {
      verifiedData: Record<string, unknown>;
      docNumber?: string | null;
      /** Full account number for bank_proof EV (not stored in doc_number). */
      bankAccount?: string | null;
      ifsc?: string | null;
      verificationId?: string | null;
      providerReference?: string | null;
      confidence?: number | null;
      provider?: string | null;
    };
  }
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

  const ev = options?.electronicVerify;
  const verifiedData = ev?.verifiedData && typeof ev.verifiedData === "object" ? ev.verifiedData : null;
  const docTypeStr = String(current.docType);
  const isRcDoc = docTypeStr === "rc";
  const isDlDoc = docTypeStr === "dl" || docTypeStr.startsWith("dl_");
  const isBankDoc = docTypeStr === "bank_proof";
  const isAadhaarDoc =
    docTypeStr === "aadhaar" || docTypeStr.startsWith("aadhaar");

  // DL/PAN/Aadhaar: person name. RC: vehicle owner. Bank: name_at_bank.
  const holderName = verifiedData
    ? isRcDoc
      ? String(
          verifiedData.owner ||
            verifiedData.owner_name ||
            verifiedData.name ||
            verifiedData.holder_name ||
            "",
        ).trim()
      : isBankDoc
        ? String(
            verifiedData.name_at_bank ||
              verifiedData.name ||
              verifiedData.holder_name ||
              "",
          ).trim()
        : String(
            verifiedData.name ||
              verifiedData.holder_name ||
              verifiedData.registered_name ||
              verifiedData.full_name ||
              "",
          ).trim()
    : "";
  const dobRaw = verifiedData
    ? String(verifiedData.dob || verifiedData.date_of_birth || "").trim()
    : "";
  const dobIso = /^\d{4}-\d{2}-\d{2}/.test(dobRaw) ? dobRaw.slice(0, 10) : null;
  const projectedDocNumber = (() => {
    const fromEv = ev?.docNumber?.trim() || "";
    if (fromEv) {
      if (isBankDoc) {
        const digits = fromEv.replace(/\D/g, "");
        return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : fromEv;
      }
      return isRcDoc || isDlDoc
        ? fromEv.toUpperCase().replace(/[^A-Z0-9]/g, "")
        : fromEv;
    }
    if (!verifiedData) return current.docNumber ?? null;
    if (isRcDoc) {
      return String(verifiedData.reg_no || verifiedData.vehicle_number || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "") || current.docNumber;
    }
    if (isDlDoc) {
      return String(verifiedData.dl_number || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "") || current.docNumber;
    }
    if (isBankDoc) {
      const masked = String(
        verifiedData.account_number_masked || verifiedData.bankAccountMasked || "",
      ).trim();
      return masked || current.docNumber;
    }
    return current.docNumber ?? null;
  })();

  const normalizeRcPlate = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const v = String(raw)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return v.length >= 4 ? v : null;
  };
  const previousRcPlate = isRcDoc ? normalizeRcPlate(current.docNumber) : null;
  const nextRcPlate = isRcDoc ? normalizeRcPlate(projectedDocNumber) : null;
  const isRcPlateReplace =
    Boolean(previousRcPlate) &&
    Boolean(nextRcPlate) &&
    previousRcPlate !== nextRcPlate;

  const electronicPatch = ev
    ? {
        // Dashboard Cashfree electronic — same DB fields as app APP_VERIFIED path
        // (verified + auto_verified + requires_manual_review=false + doc_number).
        // Method stays CASHFREE_AUTO so UI can label "Dashboard electronic".
        verificationMethod: "CASHFREE_AUTO" as const,
        verificationStatus: "auto_verified" as const,
        requiresManualReview: false,
        docNumber: projectedDocNumber ?? null,
        extractedName: holderName || current.extractedName,
        extractedDob: isRcDoc || isBankDoc ? current.extractedDob : dobIso || current.extractedDob,
        lastVerificationId: ev.verificationId ?? current.lastVerificationId ?? null,
        lastProviderReference: ev.providerReference ?? current.lastProviderReference ?? null,
        // Wrong RC → new RC: drop old photo refs so UI / vehicle don't keep stale image.
        ...(isRcPlateReplace
          ? {
              fileUrl: "electronic_verified",
              r2Key: null as string | null,
            }
          : {}),
        extractedDataSummary: {
          verifiedData: verifiedData ?? {},
          provider: ev.provider ?? "cashfree",
          confidence: ev.confidence ?? null,
          method: "CASHFREE_AUTO",
          source: "rider_dashboard_electronic",
        },
        metadata: {
          ...(current.metadata && typeof current.metadata === "object"
            ? (current.metadata as Record<string, unknown>)
            : {}),
          digilockerVerified:
            docTypeStr === "aadhaar" || docTypeStr.startsWith("aadhaar"),
          cashfreeProvider: "cashfree",
          cashfreeVerifiedData: verifiedData ?? {},
          ...(docTypeStr === "pan" && projectedDocNumber
            ? {
                panNumber: String(projectedDocNumber)
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, ""),
              }
            : {}),
          ...(docTypeStr === "aadhaar" || docTypeStr.startsWith("aadhaar")
            ? {
                aadhaarNumber: String(projectedDocNumber || current.docNumber || "").replace(
                  /\D/g,
                  "",
                ),
              }
            : {}),
          ...(isDlDoc && projectedDocNumber
            ? {
                dlNumber: String(projectedDocNumber)
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, ""),
                identityDocument: true,
              }
            : {}),
          ...(isRcDoc && projectedDocNumber
            ? {
                rcNumber: String(projectedDocNumber)
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, ""),
                ...(holderName ? { rcOwnerName: holderName } : {}),
                vehicleVerificationOnly: true,
              }
            : {}),
          ...(isBankDoc
            ? {
                ...(projectedDocNumber
                  ? { bankAccountMasked: projectedDocNumber }
                  : {}),
                ...(holderName ? { bankHolderName: holderName } : {}),
                ...(ev?.ifsc
                  ? { ifsc: String(ev.ifsc).trim().toUpperCase() }
                  : {}),
                bankVerificationOnly: true,
              }
            : {}),
        },
      }
    : null;

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
        verificationStatus: allSidesApproved
          ? electronicPatch?.verificationStatus ?? "approved"
          : "pending",
        verifiedAt: allSidesApproved ? new Date() : null,
        verifierUserId: allSidesApproved ? agentId : current.verifierUserId,
        rejectedReason: allSidesApproved ? null : current.rejectedReason,
        ...(allSidesApproved && electronicPatch ? electronicPatch : {}),
        updatedAt: new Date(),
      })
      .where(eq(riderDocuments.id, docId))
      .returning();

    if (!updated) return null;
    approved = updated;

    if (allSidesApproved && electronicPatch) {
      const docType = String(current.docType);
      const riderPatch: {
        aadhaarNumber?: string;
        name?: string;
        dob?: string;
        updatedAt: Date;
      } = { updatedAt: new Date() };
      if (electronicPatch.docNumber && (docType === "aadhaar" || docType.startsWith("aadhaar"))) {
        const digits = String(electronicPatch.docNumber).replace(/\D/g, "");
        if (digits.length === 12) riderPatch.aadhaarNumber = digits;
      }
      // Aadhaar is the sole source of truth for riders.name / dob.
      // PAN/DL EV must never overwrite profile name after Aadhaar.
      if (isAadhaarDoc && holderName) riderPatch.name = holderName;
      if (isAadhaarDoc && dobIso) riderPatch.dob = dobIso;
      if (riderPatch.aadhaarNumber || riderPatch.name || riderPatch.dob) {
        await db.update(riders).set(riderPatch).where(eq(riders.id, approved.riderId));
      }
      const { maybeAutoVerifyRiderSelfie } = await import("@/lib/rider-selfie-auto-verify");
      await maybeAutoVerifyRiderSelfie(approved.riderId).catch(() => false);
    }

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
      verificationStatus: electronicPatch?.verificationStatus ?? "approved",
      verifiedAt: new Date(),
      verifierUserId: agentId,
      rejectedReason: null,
      ...(electronicPatch ?? {}),
      updatedAt: new Date(),
    })
    .where(eq(riderDocuments.id, docId))
    .returning();

  if (!wholeApproved) return null;
  approved = wholeApproved;

  // Mirror PAN number / Aadhaar identity onto rider profile.
  // Name + DOB: Aadhaar only — never overwrite from PAN/DL/RC (manual or electronic).
  if (electronicPatch) {
    const docType = String(current.docType);
    const riderPatch: {
      panNumber?: string;
      aadhaarNumber?: string;
      name?: string;
      dob?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (electronicPatch.docNumber && docType === "pan") {
      riderPatch.panNumber = String(electronicPatch.docNumber)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    }
    if (electronicPatch.docNumber && (docType === "aadhaar" || docType.startsWith("aadhaar"))) {
      const digits = String(electronicPatch.docNumber).replace(/\D/g, "");
      if (digits.length === 12) riderPatch.aadhaarNumber = digits;
    }
    if (isAadhaarDoc && holderName) riderPatch.name = holderName;
    if (isAadhaarDoc && dobIso) riderPatch.dob = dobIso;

    if (
      riderPatch.panNumber ||
      riderPatch.aadhaarNumber ||
      riderPatch.name ||
      riderPatch.dob
    ) {
      await db.update(riders).set(riderPatch).where(eq(riders.id, approved.riderId));
    }
  } else if ((holderName || dobIso) && isAadhaarDoc) {
    await db
      .update(riders)
      .set({
        ...(holderName ? { name: holderName } : {}),
        ...(dobIso ? { dob: dobIso } : {}),
        updatedAt: new Date(),
      })
      .where(eq(riders.id, approved.riderId));
  }

  // Electronic RC approve → same rider_vehicles projection as rider-app onboarding.
  // Wrong plate → new plate: full vehicle replace + purge old RC photos from R2.
  if (electronicPatch && isRcDoc && verifiedData) {
    try {
      if (isRcPlateReplace) {
        try {
          const { riderDocumentFiles } = await import("@/lib/db/schema");
          const { eq } = await import("drizzle-orm");
          const { deleteDocument } = await import("@/lib/services/r2");
          const fileRows = await db
            .select({
              r2Key: riderDocumentFiles.r2Key,
            })
            .from(riderDocumentFiles)
            .where(eq(riderDocumentFiles.documentId, docId));
          const keys = new Set<string>();
          if (current.r2Key?.trim()) keys.add(current.r2Key.trim());
          for (const row of fileRows) {
            if (row.r2Key?.trim()) keys.add(row.r2Key.trim());
          }
          for (const key of keys) {
            try {
              await deleteDocument(key);
            } catch (r2Err) {
              console.warn(
                "[approveRiderDocument] R2 RC photo delete failed:",
                key,
                r2Err instanceof Error ? r2Err.message : r2Err,
              );
            }
          }
          await db
            .delete(riderDocumentFiles)
            .where(eq(riderDocumentFiles.documentId, docId));
        } catch (mediaErr) {
          console.warn(
            "[approveRiderDocument] RC media clear failed:",
            mediaErr instanceof Error ? mediaErr.message : mediaErr,
          );
        }
      }

      const { backendFetch } = await import("@/lib/notif-backend");
      const fileUrl = String(approved.fileUrl || "").trim();
      const rcDocumentUrl =
        isRcPlateReplace
          ? null
          : fileUrl &&
              fileUrl !== "electronic_verified" &&
              fileUrl !== "n/a" &&
              fileUrl !== "pending"
            ? fileUrl
            : null;
      await backendFetch("/v1/verification/project-rider-ev", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rider_id: approved.riderId,
          doc_kind: "vehicle_rc",
          verified_data: verifiedData,
          rc_document_url: rcDocumentUrl,
          previous_registration_number: previousRcPlate,
        }),
      });
    } catch (vehicleErr) {
      console.warn(
        "[approveRiderDocument] RC→rider_vehicles project failed:",
        vehicleErr instanceof Error ? vehicleErr.message : vehicleErr,
      );
    }
  }

  // Electronic bank approve → upsert rider_payment_methods (payout destination).
  if (electronicPatch && isBankDoc && verifiedData) {
    try {
      const accountNumber = String(ev?.bankAccount || "")
        .replace(/\D/g, "");
      const ifsc = String(
        ev?.ifsc ||
          verifiedData.ifsc ||
          (current.metadata && typeof current.metadata === "object"
            ? (current.metadata as Record<string, unknown>).ifsc
            : "") ||
          "",
      )
        .trim()
        .toUpperCase();
      const bankName = String(
        verifiedData.bank_name ||
          (verifiedData.ifsc_details &&
          typeof verifiedData.ifsc_details === "object" &&
          !Array.isArray(verifiedData.ifsc_details)
            ? (verifiedData.ifsc_details as { bank?: string }).bank
            : "") ||
          "",
      ).trim();
      const branch = String(
        verifiedData.branch_name ||
          (verifiedData.ifsc_details &&
          typeof verifiedData.ifsc_details === "object" &&
          !Array.isArray(verifiedData.ifsc_details)
            ? (verifiedData.ifsc_details as { branch?: string }).branch
            : "") ||
          "",
      ).trim() || null;
      const holder =
        holderName ||
        String(verifiedData.name_at_bank || "").trim() ||
        "Account Holder";

      if (/^\d{9,18}$/.test(accountNumber) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        const {
          encryptRiderAccountNumber,
        } = await import("@/lib/rider-bank-account-crypto");
        const { riderPaymentMethods } = await import("@/lib/db/schema");
        const { and, desc, eq, isNull } = await import("drizzle-orm");

        const [existingPm] = await db
          .select()
          .from(riderPaymentMethods)
          .where(
            and(
              eq(riderPaymentMethods.riderId, approved.riderId),
              eq(riderPaymentMethods.methodType, "bank"),
              isNull(riderPaymentMethods.deletedAt),
            ),
          )
          .orderBy(desc(riderPaymentMethods.createdAt))
          .limit(1);

        if (existingPm) {
          await db
            .update(riderPaymentMethods)
            .set({
              accountHolderName: holder,
              bankName: bankName || existingPm.bankName || "Bank",
              ifsc,
              branch,
              accountNumberEncrypted: encryptRiderAccountNumber(accountNumber),
              verificationStatus: "verified",
              verifiedAt: new Date(),
              proofDocumentId: approved.id,
              updatedAt: new Date(),
            })
            .where(eq(riderPaymentMethods.id, existingPm.id));
        } else {
          await db.insert(riderPaymentMethods).values({
            riderId: approved.riderId,
            methodType: "bank",
            accountHolderName: holder,
            bankName: bankName || "Bank",
            ifsc,
            branch,
            accountNumberEncrypted: encryptRiderAccountNumber(accountNumber),
            verificationStatus: "verified",
            verifiedAt: new Date(),
            proofDocumentId: approved.id,
          });
        }

        // Prefer electronic placeholder when no passbook image was uploaded.
        const fileUrl = String(approved.fileUrl || "").trim();
        if (
          !fileUrl ||
          fileUrl === "pending" ||
          fileUrl === "n/a" ||
          fileUrl === "electronic_verified"
        ) {
          await db
            .update(riderDocuments)
            .set({ fileUrl: "electronic_verified", updatedAt: new Date() })
            .where(eq(riderDocuments.id, approved.id));
        }
      }
    } catch (bankErr) {
      console.warn(
        "[approveRiderDocument] bank→payment_methods project failed:",
        bankErr instanceof Error ? bankErr.message : bankErr,
      );
    }
  }

  // Electronic Aadhaar/PAN → auto-verify selfie when already uploaded (same as app).
  if (electronicPatch) {
    const { maybeAutoVerifyRiderSelfie } = await import("@/lib/rider-selfie-auto-verify");
    await maybeAutoVerifyRiderSelfie(approved.riderId).catch(() => false);
  }

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
  const identitySubmitted = checkIdentityDocsSubmittedFromList(allDocs, filesByDocId);
  const vehicleReady = checkVehicleDocsSubmittedFromList(allDocs, vehicle?.vehicleType);
  const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);

  const { resolveRiderOnboardingStageTransition } = await import(
    "@/lib/rider-onboarding-stage-machine"
  );
  const next = resolveRiderOnboardingStageTransition({
    currentStage: (rider as any).onboardingStage,
    currentKyc: (rider as any).kycStatus,
    currentStatus: (rider as any).status,
    identitySubmitted,
    identityVerified,
    vehicleReady,
    vehicleVerified: vehicleDocsVerified,
    paymentCompleted,
  });

  if (next.changed) {
    await db
      .update(riders)
      .set({
        kycStatus: next.kycStatus as any,
        onboardingStage: next.onboardingStage as any,
        status: next.status as any,
        updatedAt: new Date(),
      })
      .where(eq(riders.id, riderId));
  }

  return {
    kycStatus: next.kycStatus,
    onboardingStage: next.onboardingStage,
    status: next.status,
  };
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

  return hasAadhaar && hasSelfie && isPanIdentityRequirementMet(docs);
}

function hasSubmittedDocFile(doc: { fileUrl?: string | null } | undefined): boolean {
  const url = String(doc?.fileUrl || "").trim();
  return Boolean(url) && url !== "pending";
}

/** Identity docs present enough to continue (verified or awaiting review). */
function checkIdentityDocsSubmittedFromList(
  docs: any[],
  filesByDocId: Map<number, { side?: string | null }[]> = new Map()
): boolean {
  const aadhaarRow = docs.find((d) => d.docType === "aadhaar");
  let aadhaarOk = false;
  if (aadhaarRow) {
    const files = filesByDocId.get(aadhaarRow.id) ?? [];
    const hasFront = files.some((f) => (f.side || "").toLowerCase() === "front");
    const hasBack = files.some((f) => (f.side || "").toLowerCase() === "back");
    aadhaarOk =
      Boolean(aadhaarRow.verified) ||
      hasSubmittedDocFile(aadhaarRow) ||
      (hasFront && hasBack);
  } else {
    aadhaarOk =
      docs.some((d) => d.docType === "aadhaar_front" && hasSubmittedDocFile(d)) &&
      docs.some((d) => d.docType === "aadhaar_back" && hasSubmittedDocFile(d));
  }

  const selfie = docs.find((d) => d.docType === "selfie");
  const selfieOk = hasSubmittedDocFile(selfie) || Boolean(selfie?.verified);

  const pan = docs.find((d) => d.docType === "pan");
  const panOk = !pan || hasSubmittedDocFile(pan) || Boolean(pan.verified);

  return aadhaarOk && selfieOk && panOk;
}

/**
 * Vehicle docs submitted for payment (presence + explicit submit when metadata exists).
 */
function checkVehicleDocsSubmittedFromList(docs: any[], _vehicleType?: string): boolean {
  const selection = docs.find((d) => d.docType === "onboarding_vehicle_selection");
  const meta =
    selection?.metadata && typeof selection.metadata === "object"
      ? (selection.metadata as Record<string, unknown>)
      : null;
  const flow = typeof meta?.onboardingFlow === "string" ? meta.onboardingFlow : null;
  const choice = typeof meta?.vehicleChoice === "string" ? meta.vehicleChoice.trim() : "";
  const submittedFor =
    typeof meta?.vehicleDocsSubmittedFor === "string" ? meta.vehicleDocsSubmittedFor.trim() : "";

  const hasDl =
    docs.some((d) => d.docType === "dl" && hasSubmittedDocFile(d)) ||
    (docs.some((d) => d.docType === "dl_front" && hasSubmittedDocFile(d)) &&
      docs.some((d) => d.docType === "dl_back" && hasSubmittedDocFile(d)));
  const hasRc = docs.some((d) => d.docType === "rc" && hasSubmittedDocFile(d));
  const hasRental =
    docs.some((d) => d.docType === "rental_proof" && hasSubmittedDocFile(d)) ||
    docs.some((d) => d.docType === "ev_proof" && hasSubmittedDocFile(d));

  if (flow === "payment") {
    return Boolean(selection && submittedFor && choice && submittedFor === choice);
  }
  if (submittedFor && choice && submittedFor === choice) {
    if (flow === "rental_ev") return hasRental;
    return hasDl && (hasRc || hasRental);
  }
  return (hasDl && (hasRc || hasRental)) || hasRental;
}

function isPanIdentityRequirementMet(
  docs: Array<{ docType: string; verified?: boolean | null }>
): boolean {
  const panDoc = docs.find((d) => d.docType === "pan");
  if (!panDoc) return true;
  return Boolean(panDoc.verified);
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
  const electronicallyVerified = documents.filter((d) => {
    const m = String(d.verificationMethod || "").toUpperCase();
    return m === "APP_VERIFIED" || m.startsWith("CASHFREE_") || m === "RAZORPAY_BANK";
  });
  const manualVerified = documents.filter((d) => d.verificationMethod === "MANUAL_UPLOAD" && d.verified);
  const verifiedTypes = new Set([...electronicallyVerified, ...manualVerified].map((d) => d.docType));
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
    const isElectronicallyVerified = (method: string | null | undefined) => {
      const m = String(method || "").toUpperCase();
      return m === "APP_VERIFIED" || m.startsWith("CASHFREE_") || m === "RAZORPAY_BANK";
    };
    const hasRcOrDl = documents.some(doc => 
      (doc.docType === 'rc' || doc.docType === 'dl') && 
      (isElectronicallyVerified(doc.verificationMethod) || doc.verified)
    );
    const hasRentalOrEvProof = documents.some(doc => 
      (doc.docType === 'rental_proof' || doc.docType === 'ev_proof') && 
      (isElectronicallyVerified(doc.verificationMethod) || doc.verified)
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
  
  // Get all documents (APP_VERIFIED / Cashfree dashboard electronic / agent-approved manual)
  const isElectronicallyVerified = (method: string | null | undefined) => {
    const m = String(method || "").toUpperCase();
    return m === "APP_VERIFIED" || m.startsWith("CASHFREE_") || m === "RAZORPAY_BANK";
  };
  const appVerifiedDocs = documents.filter(
    (doc) => isElectronicallyVerified(doc.verificationMethod)
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
  // Approval queue requires payment — never treat unpaid APPROVAL as complete.
  if (
    (rider.onboardingStage === "APPROVAL" || rider.onboardingStage === "ACTIVE") &&
    !paymentCompleted
  ) {
    missingSteps.push("Payment not completed");
  }

  return { isComplete: missingSteps.length === 0, missingSteps };
}

/**
 * Admin approval queue eligibility: paid + identity/vehicle submitted.
 * Unpaid riders must never appear as pending approval.
 */
export async function isRiderEligibleForApprovalQueue(riderId: number): Promise<boolean> {
  const rider = await getRiderById(riderId);
  if (!rider) return false;
  if (rider.status === "ACTIVE") return false;

  const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);
  if (!paymentCompleted) return false;

  const allDocs = await getDb()
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

  const identitySubmitted = checkIdentityDocsSubmittedFromList(allDocs, filesByDocId);
  const vehicleReady = checkVehicleDocsSubmittedFromList(allDocs);

  const { isEligibleForApprovalQueue } = await import("@/lib/rider-onboarding-stage-machine");
  return isEligibleForApprovalQueue({
    paymentCompleted,
    identitySubmitted,
    vehicleReady,
    onboardingStage: rider.onboardingStage,
  });
}

export type PendingOnboardingRider = {
  id: number;
  name: string | null;
  mobile: string;
  countryCode: string;
  city: string | null;
  state: string | null;
  status: string;
  onboardingStage: string;
  kycStatus: string;
  nextRequiredStep: string | null;
  onboardingProgressPct: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * Riders who have not finished onboarding (stage ≠ ACTIVE).
 * Used by control-dashboard "Pending Onboarding" so ops can call and unblock them.
 */
export async function listRidersPendingOnboarding(options?: {
  limit?: number;
  offset?: number;
  stage?: string | null;
  search?: string | null;
}): Promise<{ riders: PendingOnboardingRider[]; total: number }> {
  const db = getDb();
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const offset = Math.max(0, options?.offset ?? 0);
  const stageFilter = (options?.stage || "").trim().toUpperCase();
  const search = (options?.search || "").trim();

  const conditions = [
    isNull(riders.deletedAt),
    ne(riders.onboardingStage, "ACTIVE" as any),
    notInArray(riders.status, ["BLOCKED", "BANNED"] as any),
  ];

  if (
    stageFilter &&
    stageFilter !== "ACTIVE" &&
    ["MOBILE_VERIFIED", "KYC", "PAYMENT", "APPROVAL"].includes(stageFilter)
  ) {
    conditions.push(eq(riders.onboardingStage, stageFilter as any));
  }

  if (search) {
    const digits = search.replace(/\D/g, "");
    const gmrMatch = /^GMR(\d+)$/i.exec(search);
    if (gmrMatch) {
      conditions.push(eq(riders.id, Number(gmrMatch[1])));
    } else if (/^\d+$/.test(search) && digits.length <= 6) {
      conditions.push(eq(riders.id, Number(search)));
    } else if (digits.length >= 8) {
      conditions.push(sql`${riders.mobile} LIKE ${"%" + digits.slice(-10)}`);
    } else {
      conditions.push(
        sql`(COALESCE(${riders.name}, '') ILIKE ${"%" + search + "%"} OR ${riders.mobile} ILIKE ${"%" + search + "%"})`
      );
    }
  }

  const whereClause = and(...conditions);

  const [totalRow] = await db
    .select({ total: count() })
    .from(riders)
    .where(whereClause);

  const rows = await db
    .select({
      id: riders.id,
      name: riders.name,
      mobile: riders.mobile,
      countryCode: riders.countryCode,
      city: riders.city,
      state: riders.state,
      status: riders.status,
      onboardingStage: riders.onboardingStage,
      kycStatus: riders.kycStatus,
      nextRequiredStep: riders.nextRequiredStep,
      onboardingProgressPct: riders.onboardingProgressPct,
      createdAt: riders.createdAt,
      updatedAt: riders.updatedAt,
    })
    .from(riders)
    .where(whereClause)
    .orderBy(desc(riders.updatedAt), desc(riders.id))
    .limit(limit)
    .offset(offset);

  return {
    total: Number(totalRow?.total ?? 0),
    riders: rows.map((r) => ({
      id: r.id,
      name: r.name ?? null,
      mobile: String(r.mobile ?? ""),
      countryCode: String(r.countryCode ?? "+91"),
      city: r.city ?? null,
      state: r.state ?? null,
      status: String(r.status ?? ""),
      onboardingStage: String(r.onboardingStage ?? ""),
      kycStatus: String(r.kycStatus ?? ""),
      nextRequiredStep: r.nextRequiredStep ?? null,
      onboardingProgressPct: Number(r.onboardingProgressPct ?? 0),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    })),
  };
}

/**
 * Riders in the admin Pending Approval queue: stage APPROVAL + completed onboarding payment.
 * Never include unpaid APPROVAL rows (should be healed by migration / recompute).
 */
export async function listRidersPendingApproval(limit = 100): Promise<
  Array<{
    id: number;
    name: string | null;
    mobile: string;
    onboardingStage: string;
    kycStatus: string;
    status: string;
  }>
> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.name,
      r.mobile,
      r.onboarding_stage AS "onboardingStage",
      r.kyc_status AS "kycStatus",
      r.status
    FROM riders r
    WHERE r.onboarding_stage = 'APPROVAL'
      AND r.status NOT IN ('ACTIVE', 'BLOCKED', 'BANNED')
      AND EXISTS (
        SELECT 1
        FROM onboarding_payments p
        WHERE p.rider_id = r.id
          AND LOWER(TRIM(p.status)) = 'completed'
      )
    ORDER BY r.id DESC
    LIMIT ${limit}
  `);
  const result = rows as unknown as Array<Record<string, unknown>>;
  const candidates = (Array.isArray(result) ? result : []).map((row) => ({
    id: Number(row.id),
    name: (row.name as string | null) ?? null,
    mobile: String(row.mobile ?? ""),
    onboardingStage: String(row.onboardingStage ?? row.onboarding_stage ?? ""),
    kycStatus: String(row.kycStatus ?? row.kyc_status ?? ""),
    status: String(row.status ?? ""),
  }));

  const eligible: typeof candidates = [];
  for (const rider of candidates) {
    if (await isRiderEligibleForApprovalQueue(rider.id)) {
      eligible.push(rider);
    }
  }
  return eligible;
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
