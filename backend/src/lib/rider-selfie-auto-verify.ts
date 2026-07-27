import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments } from "../db/schema.js";

type DocRow = {
  id: number;
  docType: string;
  verified: boolean | null;
  verificationMethod: string | null;
  verificationStatus: string | null;
  metadata: unknown;
  fileUrl: string | null;
};

function isElectronicallyVerified(doc: DocRow | undefined): boolean {
  if (!doc || doc.verified !== true) return false;
  const method = String(doc.verificationMethod || "").toUpperCase();
  if (
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK"
  ) {
    return true;
  }
  const status = String(doc.verificationStatus || "").toLowerCase();
  if (status === "auto_verified") return true;
  const meta =
    doc.metadata && typeof doc.metadata === "object"
      ? (doc.metadata as Record<string, unknown>)
      : {};
  return (
    meta.digilockerVerified === true ||
    meta.aadhaarMaskingVerified === true ||
    String(doc.fileUrl || "").includes("digilocker_verified") ||
    String(doc.fileUrl || "").includes("electronic_verified")
  );
}

function aadhaarElectronicallyVerified(docs: DocRow[]): boolean {
  const composite = docs.find((d) => d.docType === "aadhaar");
  if (composite) return isElectronicallyVerified(composite);
  return (
    isElectronicallyVerified(docs.find((d) => d.docType === "aadhaar_front")) &&
    isElectronicallyVerified(docs.find((d) => d.docType === "aadhaar_back"))
  );
}

function resolveSelfieMethod(docs: DocRow[]): "APP_VERIFIED" | "CASHFREE_AUTO" {
  const identity = docs.filter((d) =>
    ["aadhaar", "aadhaar_front", "aadhaar_back", "pan"].includes(d.docType)
  );
  if (
    identity.some((d) =>
      String(d.verificationMethod || "")
        .toUpperCase()
        .startsWith("CASHFREE_")
    )
  ) {
    return "CASHFREE_AUTO";
  }
  return "APP_VERIFIED";
}

/**
 * When Aadhaar (and PAN, if present) were electronically auto-verified,
 * mark an uploaded selfie as auto-verified too — same DB shape as app electronic KYC.
 * Manual Aadhaar/PAN uploads leave selfie pending for admin Approve.
 */
export async function maybeAutoVerifyRiderSelfie(riderId: number): Promise<boolean> {
  const db = getDb();
  const docs = (await db
    .select({
      id: riderDocuments.id,
      docType: riderDocuments.docType,
      verified: riderDocuments.verified,
      verificationMethod: riderDocuments.verificationMethod,
      verificationStatus: riderDocuments.verificationStatus,
      metadata: riderDocuments.metadata,
      fileUrl: riderDocuments.fileUrl,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId))) as DocRow[];

  if (!aadhaarElectronicallyVerified(docs)) return false;

  const pan = docs.find((d) => d.docType === "pan");
  // PAN optional: missing row = skipped. Present row must be electronic, not manual-only.
  if (pan && !isElectronicallyVerified(pan)) return false;

  const selfie = docs.find((d) => d.docType === "selfie");
  if (!selfie?.fileUrl || selfie.fileUrl === "pending") return false;
  if (selfie.verified === true) return true;

  const method = resolveSelfieMethod(docs);
  await db
    .update(riderDocuments)
    .set({
      verified: true,
      verificationStatus: "auto_verified",
      verificationMethod: method,
      verifiedAt: new Date(),
      requiresManualReview: false,
      rejectedReason: null,
      metadata: {
        ...(selfie.metadata && typeof selfie.metadata === "object"
          ? (selfie.metadata as Record<string, unknown>)
          : {}),
        autoVerifiedFromIdentity: true,
        autoVerifiedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(and(eq(riderDocuments.id, selfie.id), eq(riderDocuments.riderId, riderId)));

  return true;
}
