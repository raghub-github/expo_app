import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocumentFiles, riderDocuments } from "../db/schema.js";

export type RiderKycDocStatus = "verified" | "pending" | "rejected" | "not_uploaded";

/** How the verification was decided. Drives the small pill next to the doc. */
export type RiderKycVerificationMethod = "auto" | "manual" | "pending" | null;

export type RiderKycDocumentItem = {
  docKey: string;
  label: string;
  icon: string;
  required: boolean;
  status: RiderKycDocStatus;
  verificationMethod: RiderKycVerificationMethod;
  uploaded: boolean;
  docNumber: string | null;
  rejectedReason: string | null;
  sides: Array<{
    side: string;
    label: string;
    status: RiderKycDocStatus;
    rejectedReason: string | null;
  }>;
};

/**
 * Read the projection column set by history.projectOutcomeToDocuments()
 * to decide auto vs manual. Any status prefixed 'auto_' → auto; the older
 * 'approved' / 'pending' come from the manual/agent flow.
 */
function methodFromStatus(verificationStatus: string | null, status: RiderKycDocStatus): RiderKycVerificationMethod {
  if (status === "not_uploaded") return null;
  if (verificationStatus === "auto_verified") return "auto";
  if (verificationStatus === "auto_rejected") return "auto";
  if (verificationStatus === "approved" || verificationStatus === "rejected") return "manual";
  if (status === "verified" || status === "rejected") return "manual";
  return "pending";
}

type SideVerificationMap = Partial<
  Record<"front" | "back", { verified?: boolean; verificationStatus?: string; rejectedReason?: string | null }>
>;

const CATALOG: Array<{
  docKey: string;
  label: string;
  icon: string;
  required: boolean;
  matchTypes: string[];
  composite?: boolean;
}> = [
  { docKey: "aadhaar", label: "Aadhaar", icon: "card-outline", required: true, matchTypes: ["aadhaar", "aadhaar_front", "aadhaar_back"], composite: true },
  { docKey: "pan", label: "PAN", icon: "document-text-outline", required: true, matchTypes: ["pan"] },
  { docKey: "selfie", label: "Selfie verification", icon: "person-circle-outline", required: true, matchTypes: ["selfie"] },
  { docKey: "dl", label: "Driving License", icon: "card-outline", required: true, matchTypes: ["dl", "dl_front", "dl_back"], composite: true },
  { docKey: "rc", label: "Registration Certificate (RC)", icon: "document-text-outline", required: true, matchTypes: ["rc"] },
  { docKey: "rental_proof", label: "Rental agreement", icon: "document-text-outline", required: false, matchTypes: ["rental_proof"] },
  { docKey: "ev_proof", label: "EV proof", icon: "flash-outline", required: false, matchTypes: ["ev_proof"] },
  { docKey: "bank_proof", label: "Bank account proof", icon: "business-outline", required: false, matchTypes: ["bank_proof"] },
  { docKey: "insurance", label: "Insurance", icon: "shield-outline", required: false, matchTypes: ["insurance"] },
];

function readSideVerification(metadata: unknown): SideVerificationMap {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = (metadata as Record<string, unknown>).sideVerification;
  if (!raw || typeof raw !== "object") return {};
  return raw as SideVerificationMap;
}

/** Matches dashboard `isExpandedDocVerified` / `isCompositeDocSideComplete` legacy rule. */
function isSideVerified(
  metadata: unknown,
  side: "front" | "back",
  parentVerified: boolean,
): boolean {
  const sv = readSideVerification(metadata);
  const entry = sv[side];
  if (entry?.verified === true || entry?.verificationStatus === "approved") return true;
  if (Object.keys(sv).length === 0 && parentVerified) return true;
  return false;
}

function isSideRejected(metadata: unknown, side: "front" | "back"): boolean {
  return readSideVerification(metadata)[side]?.verificationStatus === "rejected";
}

function sideRejectedReason(metadata: unknown, side: "front" | "back"): string | null {
  const reason = readSideVerification(metadata)[side]?.rejectedReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

function rowStatus(
  row: {
    verified: boolean;
    verificationStatus: string | null;
    rejectedReason: string | null;
    metadata: unknown;
  } | null,
  files: { side: string | null }[],
  composite: boolean,
): { status: RiderKycDocStatus; rejectedReason: string | null; sides: RiderKycDocumentItem["sides"] } {
  if (!row) {
    return { status: "not_uploaded", rejectedReason: null, sides: [] };
  }

  const sides: RiderKycDocumentItem["sides"] = [];
  if (composite) {
    const requiredSides = [...new Set(
      files
        .map((f) => (f.side || "").toLowerCase())
        .filter((s): s is "front" | "back" => s === "front" || s === "back"),
    )];

    const legacyAllSidesVerified =
      row.verified && Object.keys(readSideVerification(row.metadata)).length === 0;

    for (const side of requiredSides.length > 0 ? requiredSides : (["front", "back"] as const)) {
      let sideStatus: RiderKycDocStatus = "pending";
      if (
        legacyAllSidesVerified ||
        isSideVerified(row.metadata, side, row.verified) ||
        (requiredSides.length === 0 && row.verified)
      ) {
        sideStatus = "verified";
      } else if (isSideRejected(row.metadata, side)) {
        sideStatus = "rejected";
      }
      sides.push({
        side,
        label: side === "front" ? "Front" : "Back",
        status: sideStatus,
        rejectedReason: sideRejectedReason(row.metadata, side),
      });
    }

    if (sides.some((s) => s.status === "rejected")) {
      return {
        status: "rejected",
        rejectedReason: sides.find((s) => s.rejectedReason)?.rejectedReason ?? row.rejectedReason,
        sides,
      };
    }
    if (legacyAllSidesVerified && sides.length > 0) {
      const verifiedSides = sides.map((s) => ({ ...s, status: "verified" as const }));
      return { status: "verified", rejectedReason: null, sides: verifiedSides };
    }
    if (sides.length > 0 && sides.every((s) => s.status === "verified")) {
      return { status: "verified", rejectedReason: null, sides };
    }
    if (sides.length > 0) {
      return { status: "pending", rejectedReason: null, sides };
    }
  }

  if (row.verificationStatus === "rejected") {
    return { status: "rejected", rejectedReason: row.rejectedReason, sides };
  }
  if (row.verified || row.verificationStatus === "approved") {
    return { status: "verified", rejectedReason: null, sides };
  }
  return { status: "pending", rejectedReason: null, sides };
}

const REQUIRED_DOC_KEYS = new Set(["aadhaar", "pan", "selfie", "dl", "rc"]);

function simpleRowStatus(row: {
  verified: boolean;
  verificationStatus: string | null;
  rejectedReason: string | null;
}): RiderKycDocStatus {
  if (row.verificationStatus === "rejected") return "rejected";
  if (row.verified || row.verificationStatus === "approved") return "verified";
  return "pending";
}

function resolveSplitComposite(
  latestByType: Map<string, { verified: boolean; verificationStatus: string | null; rejectedReason: string | null; docNumber: string | null; metadata: unknown }>,
  frontType: string,
  backType: string,
): {
  uploaded: boolean;
  docNumber: string | null;
  status: RiderKycDocStatus;
  rejectedReason: string | null;
  sides: RiderKycDocumentItem["sides"];
} | null {
  const frontRow = latestByType.get(frontType);
  const backRow = latestByType.get(backType);
  if (!frontRow && !backRow) return null;

  const sides: RiderKycDocumentItem["sides"] = [];
  if (frontRow) {
    sides.push({
      side: "front",
      label: "Front",
      status: simpleRowStatus(frontRow),
      rejectedReason: frontRow.rejectedReason,
    });
  }
  if (backRow) {
    sides.push({
      side: "back",
      label: "Back",
      status: simpleRowStatus(backRow),
      rejectedReason: backRow.rejectedReason,
    });
  }

  let status: RiderKycDocStatus = "pending";
  if (sides.some((s) => s.status === "rejected")) status = "rejected";
  else if (sides.length > 0 && sides.every((s) => s.status === "verified")) status = "verified";

  const docNumber = frontRow?.docNumber ?? backRow?.docNumber ?? null;
  const rejectedReason =
    sides.find((s) => s.rejectedReason)?.rejectedReason ??
    frontRow?.rejectedReason ??
    backRow?.rejectedReason ??
    null;

  return { uploaded: true, docNumber, status, rejectedReason, sides };
}

export async function getRiderKycDocumentsForApp(riderId: number): Promise<{
  documents: RiderKycDocumentItem[];
  verifiedCount: number;
  uploadedCount: number;
  totalCount: number;
  kycCompleted: boolean;
}> {
  const db = getDb();

  const docRows = await db
    .select({
      id: riderDocuments.id,
      docType: riderDocuments.docType,
      docNumber: riderDocuments.docNumber,
      verified: riderDocuments.verified,
      verificationStatus: riderDocuments.verificationStatus,
      rejectedReason: riderDocuments.rejectedReason,
      metadata: riderDocuments.metadata,
      createdAt: riderDocuments.createdAt,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId))
    .orderBy(desc(riderDocuments.createdAt));

  const docIds = docRows.map((d) => d.id);
  const fileRows =
    docIds.length > 0
      ? await db
          .select({
            documentId: riderDocumentFiles.documentId,
            side: riderDocumentFiles.side,
          })
          .from(riderDocumentFiles)
          .where(inArray(riderDocumentFiles.documentId, docIds))
      : [];

  const filesByDocId = new Map<number, { side: string | null }[]>();
  for (const f of fileRows) {
    const list = filesByDocId.get(f.documentId) ?? [];
    list.push({ side: f.side });
    filesByDocId.set(f.documentId, list);
  }

  const latestByType = new Map<string, (typeof docRows)[number]>();
  for (const row of docRows) {
    const t = String(row.docType);
    if (!latestByType.has(t)) latestByType.set(t, row);
  }

  const allBuilt: RiderKycDocumentItem[] = [];

  for (const entry of CATALOG) {
    let parentRow: (typeof docRows)[number] | null = null;
    const baseType = entry.matchTypes.find((type) => !type.includes("_"));
    if (baseType) parentRow = latestByType.get(baseType) ?? null;

    let status: RiderKycDocStatus = "not_uploaded";
    let rejectedReason: string | null = null;
    let sides: RiderKycDocumentItem["sides"] = [];
    let docNumber: string | null = null;
    let uploaded = false;

    if (parentRow) {
      const files = filesByDocId.get(parentRow.id) ?? [];
      const resolved = rowStatus(parentRow, files, Boolean(entry.composite));
      status = resolved.status;
      rejectedReason = resolved.rejectedReason;
      sides = resolved.sides;
      docNumber = parentRow.docNumber ?? null;
      uploaded = true;
    } else if (entry.composite && entry.docKey === "aadhaar") {
      const split = resolveSplitComposite(latestByType, "aadhaar_front", "aadhaar_back");
      if (split) {
        uploaded = split.uploaded;
        status = split.status;
        rejectedReason = split.rejectedReason;
        sides = split.sides;
        docNumber = split.docNumber;
      }
    } else if (entry.composite && entry.docKey === "dl") {
      const split = resolveSplitComposite(latestByType, "dl_front", "dl_back");
      if (split) {
        uploaded = split.uploaded;
        status = split.status;
        rejectedReason = split.rejectedReason;
        sides = split.sides;
        docNumber = split.docNumber;
      }
    }

    allBuilt.push({
      docKey: entry.docKey,
      label: entry.label,
      icon: entry.icon,
      required: entry.required,
      status,
      verificationMethod: methodFromStatus(parentRow?.verificationStatus ?? null, status),
      uploaded,
      docNumber,
      rejectedReason,
      sides,
    });
  }

  const documents = allBuilt.filter((d) => d.uploaded);
  const verifiedCount = documents.filter((d) => d.status === "verified").length;
  const uploadedCount = documents.length;

  const kycCompleted = [...REQUIRED_DOC_KEYS].every((key) => {
    const doc = allBuilt.find((d) => d.docKey === key);
    return doc != null && doc.uploaded && doc.status === "verified";
  });

  return {
    documents,
    verifiedCount,
    uploadedCount,
    totalCount: documents.length,
    kycCompleted,
  };
}
