import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/client.js";
import { getSupabase } from "../../lib/supabase.js";
import { maskAadhaarNumber } from "../../lib/mask-aadhaar.js";
import {
  MERCHANT_DOCUMENT_PREFIXES,
  enrichLicenseEvaluation,
  renewalMetadataPatch,
  type MerchantDocumentPrefix,
} from "../../lib/merchant-license/merchantLicenseExpiry.js";
import { recordLicenceRenewalUpload } from "../../lib/merchant-license/merchantLicenceHistory.js";
import {
  loadMerchantLicenseEvaluation,
  syncMerchantLicenseCompliance,
} from "../../lib/merchant-license/syncMerchantLicenseCompliance.js";
import { listLicenceHistoryGrouped } from "../../lib/merchant-license/merchantLicenceHistory.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DOC_TYPES = MERCHANT_DOCUMENT_PREFIXES;

async function getPartnerParentId(
  sql: ReturnType<typeof getSql>,
  parentMerchantId: string
): Promise<number | null> {
  const rows = await sql`
    SELECT id FROM merchant_parents WHERE parent_merchant_id = ${parentMerchantId} LIMIT 1
  `;
  return rows.length > 0 ? Number((rows[0] as { id: number }).id) : null;
}

async function assertStoreOwned(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  parentId: number
): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM merchant_stores
    WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "file";
}

function extensionFromFilename(filename: string, mime: string): string {
  const rawName = filename || "";
  const fromName = rawName.includes(".") ? rawName.slice(rawName.lastIndexOf(".")).toLowerCase() : "";
  if (fromName && /^[.][a-z0-9]+$/.test(fromName)) return fromName;
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  return ".bin";
}

function parseExpiryDate(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function buildR2Key(
  parentId: number,
  storeCode: string,
  docType: string,
  ext: string,
  side?: string | null
): string {
  let base = docType;
  if (docType === "aadhaar") {
    base = side === "back" ? "aadhar_back" : "aadhar_front";
  } else if (docType === "pharmacy_council_registration") {
    base = "pharmacy_council";
  }
  return `docs/merchants/${parentId}/stores/${storeCode}/onboarding/documents/${base}_${Date.now()}${ext}`;
}

function storedDocumentProxyUrl(key: string): string {
  const k = String(key || "")
    .trim()
    .replace(/^\/+/, "");
  return `/api/attachments/proxy?key=${encodeURIComponent(k)}`;
}

export function registerMerchantLicenseDocumentRoutes(protectedApp: FastifyInstance) {
  /** GET /merchant-partner/stores/:storeId/license-documents/status */
  protectedApp.get<{ Params: { storeId: string } }>(
    "/stores/:storeId/license-documents/status",
    async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ error: "merchant_required" });
      }
      const storeId = Number(req.params.storeId);
      if (!Number.isInteger(storeId) || storeId < 1) {
        return reply.code(400).send({ error: "invalid_store_id" });
      }

      const sql = getSql();
      const parentId = await getPartnerParentId(sql, req.auth.sub);
      if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
      if (!(await assertStoreOwned(sql, storeId, parentId))) {
        return reply.code(404).send({ error: "store_not_found" });
      }

      const db = getSupabase();
      const { data: docRow } = await db
        .from("merchant_store_documents")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();

      const evaluation = await loadMerchantLicenseEvaluation(db, storeId);
      const enriched = enrichLicenseEvaluation(evaluation, (docRow ?? {}) as Record<string, unknown>);
      const historyGrouped = await listLicenceHistoryGrouped(db, storeId);

      return reply.send({
        license_blocked: enriched.evaluation.blocked,
        license_can_manual_open: enriched.evaluation.can_manual_open,
        license_expired_documents: enriched.evaluation.expired,
        license_pending_verification: enriched.evaluation.pending_verification,
        license_expiring_soon: enriched.evaluation.expiring_soon,
        documents: enriched.evaluation.documents,
        action_items: enriched.action_items,
        uploadable_items: enriched.uploadable_items,
        licence_history: historyGrouped,
      });
    }
  );

  /** POST /merchant-partner/stores/:storeId/license-documents/upload — multipart renewal */
  protectedApp.post<{ Params: { storeId: string } }>(
    "/stores/:storeId/license-documents/upload",
    async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ error: "merchant_required" });
      }
      const storeId = Number(req.params.storeId);
      if (!Number.isInteger(storeId) || storeId < 1) {
        return reply.code(400).send({ error: "invalid_store_id" });
      }

      const sql = getSql();
      const parentId = await getPartnerParentId(sql, req.auth.sub);
      if (parentId == null) return reply.code(404).send({ error: "partner_not_found" });
      if (!(await assertStoreOwned(sql, storeId, parentId))) {
        return reply.code(404).send({ error: "store_not_found" });
      }

      const fieldValues: Record<string, string> = {};
      let fileBuffer: Buffer | null = null;
      let fileMime = "application/octet-stream";
      let fileFilename = "licence.jpg";

      const parts = (req as any).parts?.();
      if (parts) {
        for await (const part of parts) {
          if (part.type === "file") {
            fileBuffer = await part.toBuffer();
            fileMime = part.mimetype || fileMime;
            fileFilename = String(part.filename || fileFilename);
          } else if (part.type === "field") {
            fieldValues[String(part.fieldname)] = String(part.value ?? "").trim();
          }
        }
      } else {
        const filePart = await (req as any).file?.();
        if (filePart) {
          fileBuffer = await filePart.toBuffer();
          fileMime = filePart.mimetype || fileMime;
          fileFilename = String(filePart.filename || fileFilename);
          const fields = filePart.fields ?? {};
          for (const [k, v] of Object.entries(fields)) {
            const val = Array.isArray(v) ? v[0]?.value : (v as { value?: string })?.value;
            if (val != null) fieldValues[k] = String(val).trim();
          }
        }
      }

      if (!fileBuffer || fileBuffer.length <= 0) return reply.code(400).send({ error: "no_file" });
      if (fileBuffer.length > MAX_FILE_BYTES) return reply.code(400).send({ error: "file_too_large" });

      const docType = fieldValues.docType || "";
      if (!DOC_TYPES.includes(docType as MerchantDocumentPrefix)) {
        return reply.code(400).send({ error: "invalid_doc_type" });
      }
      const prefix = docType as MerchantDocumentPrefix;
      const side = (fieldValues.side || "front").toLowerCase();
      const isAadhaarBack = prefix === "aadhaar" && side === "back";
      const docNumber = fieldValues.document_number || null;
      const issueDate = parseExpiryDate(fieldValues.issue_date || null);
      const expiryDate = parseExpiryDate(fieldValues.expiry_date || null);

      if (!isAadhaarBack && !expiryDate) {
        return reply.code(400).send({ error: "expiry_date_required" });
      }
      if (expiryDate) {
        const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        if (expiryDate <= todayKey) {
          return reply.code(400).send({ error: "expiry_must_be_future" });
        }
      }

      const db = getSupabase();
      const { data: storeRow, error: storeErr } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id")
        .eq("id", storeId)
        .single();
      if (storeErr || !storeRow?.parent_id) {
        return reply.code(404).send({ error: "store_not_found" });
      }

      const storeParentId = storeRow.parent_id as number;
      const storeCode = String(storeRow.store_id || storeId);
      const ext = extensionFromFilename(fileFilename, fileMime);
      const r2Key = buildR2Key(storeParentId, storeCode, prefix, ext, side);

      const { uploadToR2 } = await import("../../services/r2/r2Service.js");
      try {
        await uploadToR2(fileBuffer, r2Key, fileMime || "application/octet-stream");
      } catch (e: any) {
        req.log.error(e, "license_doc_upload_failed");
        return reply.code(500).send({ error: "upload_failed" });
      }

      const storedUrl = storedDocumentProxyUrl(r2Key);
      const { data: existingRow } = await db
        .from("merchant_store_documents")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();

      const existing = (existingRow ?? {}) as Record<string, unknown>;
      const metaKey = `${prefix}_document_metadata`;
      const prevMeta =
        existing && typeof existing === "object" && metaKey in existing
          ? (existing[metaKey] as Record<string, unknown> | null)
          : null;
      const nowIso = new Date().toISOString();

      if (isAadhaarBack) {
        const mergedMeta = {
          ...(prevMeta && typeof prevMeta === "object" ? prevMeta : {}),
          back_url: storedUrl,
          renewal_pending: true,
          renewal_submitted_at: nowIso,
        };
        try {
          await recordLicenceRenewalUpload(db, {
            storeId,
            parentId: storeParentId,
            prefix,
            existingFlat: existing,
            fileUrl:
              (existing.aadhaar_document_url != null
                ? String(existing.aadhaar_document_url).trim()
                : "") || storedUrl,
            backFileUrl: storedUrl,
            licenceNumber: docNumber,
            expiresAt: expiryDate,
            documentMetadata: mergedMeta,
            backOnly: true,
          });
        } catch (histErr) {
          req.log.warn(histErr, "license_history_back");
        }
        const patch: Record<string, unknown> = {
          store_id: storeId,
          aadhaar_document_metadata: mergedMeta,
          aadhaar_is_verified: false,
          aadhaar_verified_at: null,
          aadhaar_verified_by: null,
          aadhaar_updated_at: nowIso,
          updated_at: nowIso,
        };
        if (expiryDate) patch.aadhaar_expiry_date = expiryDate;
        if (docNumber) patch.aadhaar_document_number = maskAadhaarNumber(docNumber);
        const { error: upsertErr } = await db.from("merchant_store_documents").upsert(patch, {
          onConflict: "store_id",
        });
        if (upsertErr) return reply.code(500).send({ error: "save_failed" });
      } else {
        const renewalMeta = renewalMetadataPatch(prevMeta);
        try {
          await recordLicenceRenewalUpload(db, {
            storeId,
            parentId: storeParentId,
            prefix,
            existingFlat: existing,
            fileUrl: storedUrl,
            fileName: sanitizeFileName(fileFilename || prefix),
            licenceNumber: docNumber,
            issuedAt: issueDate,
            expiresAt: expiryDate,
            documentMetadata: renewalMeta as Record<string, unknown>,
          });
        } catch (histErr) {
          req.log.warn(histErr, "license_history");
        }
        const patch: Record<string, unknown> = {
          store_id: storeId,
          [`${prefix}_document_url`]: storedUrl,
          [`${prefix}_document_name`]: sanitizeFileName(fileFilename || prefix),
          [`${prefix}_is_verified`]: false,
          [`${prefix}_verified_at`]: null,
          [`${prefix}_verified_by`]: null,
          [`${prefix}_rejection_reason`]: null,
          [`${prefix}_updated_at`]: nowIso,
          updated_at: nowIso,
          [metaKey]: renewalMeta,
        };
        if (issueDate) patch[`${prefix}_issued_date`] = issueDate;
        if (expiryDate) patch[`${prefix}_expiry_date`] = expiryDate;
        patch[`${prefix}_is_expired`] = false;
        if (docNumber) patch[`${prefix}_document_number`] = docNumber;
        const { error: upsertErr } = await db.from("merchant_store_documents").upsert(patch, {
          onConflict: "store_id",
        });
        if (upsertErr) return reply.code(500).send({ error: "save_failed" });
      }

      await syncMerchantLicenseCompliance(db, storeId);

      return reply.send({
        success: true,
        document_url: storedUrl,
        docType: prefix,
        side: isAadhaarBack ? "back" : "front",
        expiry_date: expiryDate,
        is_verified: false,
        message:
          "Document uploaded. Gatimitra team will verify it before you can go online.",
      });
    }
  );
}
