/**
 * Load Aadhaar identity for a rider and mark PAN/DL docs as mismatch / pending review.
 * RC is vehicle verification only — never marked via Aadhaar identity mismatch.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments, riders } from "../db/schema.js";
import {
  crossCheckAgainstAadhaar,
  type AadhaarIdentityRef,
  type CrossMatchResult,
} from "./rider-cross-document-match.js";
import { maskAadhaarNumber } from "./mask-aadhaar.js";

const DOC_TYPE_BY_KIND: Record<"pan" | "driving_licence" | "vehicle_rc", string> = {
  pan: "pan",
  driving_licence: "dl",
  vehicle_rc: "rc",
};

export async function loadRiderAadhaarIdentity(riderId: number): Promise<AadhaarIdentityRef> {
  const db = getDb();
  const rows = await db
    .select({
      name: riders.name,
      dob: riders.dob,
      aadhaarNumber: riders.aadhaarNumber,
    })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  const rider = rows[0];
  let name = String(rider?.name || "").trim();
  let dob =
    rider?.dob != null
      ? String(rider.dob).slice(0, 10)
      : null;
  let aadhaarMasked = rider?.aadhaarNumber
    ? maskAadhaarNumber(String(rider.aadhaarNumber))
    : null;

  // Prefer extracted fields from verified Aadhaar document row when richer.
  const aadhaarDocs = await db
    .select({
      extractedName: riderDocuments.extractedName,
      extractedDob: riderDocuments.extractedDob,
      docNumber: riderDocuments.docNumber,
      metadata: riderDocuments.metadata,
      verified: riderDocuments.verified,
    })
    .from(riderDocuments)
    .where(and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, "aadhaar")))
    .orderBy(desc(riderDocuments.updatedAt))
    .limit(1);

  const ad = aadhaarDocs[0];
  if (ad) {
    const meta = (ad.metadata && typeof ad.metadata === "object"
      ? (ad.metadata as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const details =
      meta.verifiedDetails && typeof meta.verifiedDetails === "object"
        ? (meta.verifiedDetails as Record<string, unknown>)
        : meta;
    const fromDoc = String(
      ad.extractedName ||
        details.name ||
        details.holder_name ||
        details.full_name ||
        meta.fullName ||
        "",
    ).trim();
    if (fromDoc.length >= 2) name = fromDoc;
    const dobRaw = String(
      ad.extractedDob || details.dob || details.date_of_birth || meta.dob || "",
    ).trim();
    if (dobRaw) dob = dobRaw.slice(0, 10);
    if (!aadhaarMasked && ad.docNumber) {
      aadhaarMasked = maskAadhaarNumber(String(ad.docNumber));
    }
  }

  return { name, dob, aadhaarMasked };
}

export async function crossCheckRiderDocument(args: {
  riderId: number;
  docKind: "pan" | "driving_licence" | "vehicle_rc";
  verifiedData?: Record<string, unknown> | null;
}): Promise<CrossMatchResult> {
  const aadhaar = await loadRiderAadhaarIdentity(args.riderId);
  return crossCheckAgainstAadhaar({
    docKind: args.docKind,
    aadhaar,
    verifiedData: args.verifiedData,
  });
}

/**
 * Downgrade auto-verified doc to pending manual review after Aadhaar mismatch.
 * Does not delete provider results — stores them under metadata for admin review.
 */
export async function markRiderDocumentAadhaarMismatch(args: {
  riderId: number;
  docKind: "pan" | "driving_licence" | "vehicle_rc";
  cross: CrossMatchResult;
  verifiedData?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getDb();
  const docType = DOC_TYPE_BY_KIND[args.docKind];
  const existing = await db
    .select({ id: riderDocuments.id, metadata: riderDocuments.metadata })
    .from(riderDocuments)
    .where(and(eq(riderDocuments.riderId, args.riderId), eq(riderDocuments.docType, docType)))
    .orderBy(desc(riderDocuments.updatedAt))
    .limit(1);

  const prevMeta =
    existing[0]?.metadata && typeof existing[0].metadata === "object"
      ? (existing[0].metadata as Record<string, unknown>)
      : {};

  const nextMeta = {
    ...prevMeta,
    autoVerification: {
      status: "mismatch",
      label: "Auto Verification Failed – Data Mismatch",
      reasons: args.cross.reasons,
      messages: args.cross.messages,
      aadhaarReference: args.cross.aadhaar,
      extracted: args.cross.extracted,
      providerVerifiedData: args.verifiedData ?? null,
      at: new Date().toISOString(),
    },
    requiresManualReview: true,
    crossCheckFailed: true,
  };

  const patch = {
    verified: false,
    verificationStatus: "pending" as const,
    verificationMethod: "MANUAL_UPLOAD" as const,
    requiresManualReview: true,
    rejectedReason: args.cross.messages.join("; ") || "Auto Verification Failed – Data Mismatch",
    metadata: nextMeta,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(riderDocuments).set(patch).where(eq(riderDocuments.id, existing[0].id));
    return;
  }

  // No row yet (common before photo save) — insert a stub so admin sees auto result.
  await db.insert(riderDocuments).values({
    riderId: args.riderId,
    docType: docType as "pan" | "dl" | "rc",
    fileUrl: "pending_manual_after_mismatch",
    extractedName: args.cross.extracted.name || null,
    extractedDob: args.cross.extracted.dob || null,
    metadata: nextMeta,
    verified: false,
    verificationStatus: "pending",
    verificationMethod: "MANUAL_UPLOAD",
    requiresManualReview: true,
    rejectedReason: args.cross.messages.join("; ") || "Auto Verification Failed – Data Mismatch",
  });
}
