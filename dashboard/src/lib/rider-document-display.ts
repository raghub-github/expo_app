/**
 * Rider app stores composite docs (aadhaar, dl) with front/back in rider_document_files.
 * Dashboard verification UI expects split types: aadhaar_front, aadhaar_back, dl_front, dl_back.
 */

import {
  getExpandedDocRejectedReason,
  isExpandedDocVerified,
} from "@/lib/rider-document-side-verification";

type DocumentFile = {
  side?: string | null;
  fileUrl: string;
  r2Key?: string | null;
  id?: number;
  sortOrder?: number;
};

export type RiderDocumentRow = {
  id: number;
  docType: string;
  fileUrl: string;
  r2Key?: string | null;
  docNumber?: string | null;
  metadata?: Record<string, unknown> | null;
  files?: DocumentFile[];
  [key: string]: unknown;
};

const SPLIT_BASE_TYPES = new Set(["aadhaar", "dl"]);
const ALREADY_SPLIT_TYPES = new Set([
  "aadhaar_front",
  "aadhaar_back",
  "dl_front",
  "dl_back",
]);

function sideToDocType(baseType: string, side: string | null | undefined): string {
  const normalized = (side || "single").toLowerCase();
  if (normalized === "front" || normalized === "back") {
    return `${baseType}_${normalized}`;
  }
  if (baseType === "aadhaar") return "aadhaar_front";
  if (baseType === "dl") return "dl_front";
  return baseType;
}

function resolveDocNumber(
  doc: RiderDocumentRow,
  docType: string,
  rider?: { aadhaarNumber?: string | null; panNumber?: string | null } | null
): string | null {
  if (doc.docNumber?.trim()) return doc.docNumber.trim();

  const meta = (doc.metadata ?? {}) as Record<string, unknown>;
  const summary = (doc.extractedDataSummary ??
    doc.extracted_data_summary ??
    {}) as Record<string, unknown>;
  const verifiedData = (summary.verifiedData ??
    summary.verified_data ??
    {}) as Record<string, unknown>;

  if (docType.startsWith("aadhaar")) {
    const fromMeta = meta.aadhaarNumber;
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.replace(/\D/g, "");
    const fromSummary = String(
      verifiedData.masked_aadhaar ||
        verifiedData.aadhaar_number ||
        verifiedData.uid ||
        "",
    ).replace(/\D/g, "");
    if (fromSummary.length >= 4) return fromSummary;
    if (rider?.aadhaarNumber?.trim()) return rider.aadhaarNumber.replace(/\D/g, "");
  }
  if (docType === "pan") {
    const fromMeta = meta.panNumber;
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim().toUpperCase();
    const fromSummary = String(verifiedData.pan || "").trim().toUpperCase();
    if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(fromSummary)) return fromSummary;
    if (rider?.panNumber?.trim()) return rider.panNumber.trim().toUpperCase();
  }
  if (docType.startsWith("dl")) {
    const fromMeta = meta.dlNumber;
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
    const fromSummary = String(verifiedData.dl_number || "").trim();
    if (fromSummary.length >= 6) return fromSummary;
  }
  if (docType === "rc") {
    const fromMeta = meta.rcNumber;
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
    const fromSummary = String(verifiedData.reg_no || "").trim();
    if (fromSummary.length >= 4) return fromSummary;
  }

  return null;
}

export function expandRiderDocumentsForDashboard<T extends RiderDocumentRow>(
  documents: T[],
  rider?: { aadhaarNumber?: string | null; panNumber?: string | null } | null
): T[] {
  const expanded: T[] = [];

  for (const doc of documents) {
    if (ALREADY_SPLIT_TYPES.has(doc.docType)) {
      expanded.push({
        ...doc,
        docNumber: resolveDocNumber(doc, doc.docType, rider),
        docKey: `${doc.id}-${doc.docType}`,
      } as T);
      continue;
    }

    const files = doc.files ?? [];
    const isMultiSide = SPLIT_BASE_TYPES.has(doc.docType);

    if (isMultiSide && files.length > 0) {
      for (const file of files) {
        const virtualDocType = sideToDocType(doc.docType, file.side);
        const hasMultipleFiles = files.length > 1;
        expanded.push({
          ...doc,
          docType: virtualDocType,
          docKey: `${doc.id}-${virtualDocType}`,
          fileUrl: file.fileUrl,
          r2Key: file.r2Key ?? doc.r2Key ?? null,
          docNumber: resolveDocNumber(doc, virtualDocType, rider),
          files: [file],
          verified: isExpandedDocVerified(doc, file.side, hasMultipleFiles),
          rejectedReason: getExpandedDocRejectedReason(doc, file.side, hasMultipleFiles),
        } as T);
      }
      continue;
    }

    if (isMultiSide) {
      const method = String(doc.verificationMethod || "");
      const status = String(doc.verificationStatus || "");
      const appVerified =
        method === "APP_VERIFIED" ||
        status === "auto_verified" ||
        (doc.verified === true &&
          Boolean((doc.metadata as Record<string, unknown> | null)?.digilockerVerified));

      // DigiLocker / auto-verify without photo sides — both cards show as APP_VERIFIED.
      if (appVerified) {
        for (const side of ["front", "back"] as const) {
          const virtualDocType = `${doc.docType}_${side}`;
          expanded.push({
            ...doc,
            docType: virtualDocType,
            docKey: `${doc.id}-${virtualDocType}`,
            docNumber: resolveDocNumber(doc, virtualDocType, rider),
            verified: true,
            verificationMethod: "APP_VERIFIED",
            verificationStatus: "auto_verified",
            fileUrl: doc.fileUrl || "digilocker_verified",
            r2Key: null,
            files: [],
          } as T);
        }
        continue;
      }

      const virtualDocType = sideToDocType(doc.docType, "front");
      expanded.push({
        ...doc,
        docType: virtualDocType,
        docKey: `${doc.id}-${virtualDocType}`,
        docNumber: resolveDocNumber(doc, virtualDocType, rider),
      } as T);
      continue;
    }

    expanded.push({
      ...doc,
      docNumber: resolveDocNumber(doc, doc.docType, rider),
      docKey: `${doc.id}-${doc.docType}`,
    } as T);
  }

  return expanded;
}
