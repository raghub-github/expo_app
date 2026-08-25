/**
 * GET /api/merchant/stores/[id]/documents
 * Returns the full `merchant_store_documents` row for the store (same shape as verification-data `documents`).
 *
 * PATCH /api/merchant/stores/[id]/documents
 * Update store document numbers (agent verification edits).
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchantStoreForId } from "@/lib/merchant-store-route-auth";
import { getSql } from "@/lib/db/client";
import { ensureMerchantStoreDocumentsStep4JsonColumns } from "@/lib/db/ensure-step4-resubmission-flags-column";
import { rejectionDetailForDocType, rejectionRequiresNewFileUpload } from "@/lib/merchant-store-document-rejection";
import {
  asRecord,
  mergeAutoVerificationMetadata,
  mergeExtractedDataSummary,
  mergeGstFetchedIntoVerifiedDetails,
  pickGstFetchedBusinessInfo,
  verifiedDetailsForUi,
} from "@/lib/merchant-doc-auto-verification";
import { maskAadhaarNumber } from "@/lib/mask-aadhaar";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }

    const access = await authenticateMerchantStoreForId(request, storeId);
    if (!access.ok) return access.response;

    const sql = getSql();
    const docRows = await sql`
      SELECT *
      FROM merchant_store_documents
      WHERE store_id = ${storeId}
      LIMIT 1
    `;
    const raw = Array.isArray(docRows) ? docRows[0] : docRows;
    if (!raw) {
      return NextResponse.json({ success: true, row: null });
    }
    const d = raw as Record<string, unknown>;
    Object.keys(d).forEach((key) => {
      const value = d[key];
      if (value instanceof Date) d[key] = value.toISOString();
    });
    return NextResponse.json({ success: true, row: d });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/documents]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

const DOC_NUMBER_KEYS = [
  "pan_document_number",
  "gst_document_number",
  "aadhaar_document_number",
  "fssai_document_number",
  "drug_license_document_number",
  "trade_license_document_number",
  "shop_establishment_document_number",
  "udyam_document_number",
  "other_document_number",
  "bank_proof_document_number",
  "pharmacist_certificate_document_number",
  "pharmacy_council_registration_document_number",
] as const;

const DOC_URL_KEYS = [
  "pan_document_url",
  "gst_document_url",
  "aadhaar_document_url",
  "fssai_document_url",
  "drug_license_document_url",
  "trade_license_document_url",
  "shop_establishment_document_url",
  "udyam_document_url",
  "other_document_url",
  "bank_proof_document_url",
  "pharmacist_certificate_document_url",
  "pharmacy_council_registration_document_url",
] as const;

const DOC_NAME_KEYS = [
  "pan_document_name",
  "gst_document_name",
  "aadhaar_document_name",
  "fssai_document_name",
  "drug_license_document_name",
  // Holder name fields - keep separate from document_name so we don't overwrite file labels
  "pan_holder_name",
  "aadhaar_holder_name",
  // GSTIN fetched / manual business details
  "gst_legal_business_name",
  "gst_principal_place_of_business",
  "gst_effective_registration_date",
  // Other document helper fields coming from onboarding
  "other_document_type",
] as const;

const DOC_DATE_KEYS = [
  "fssai_expiry_date",
  "trade_license_expiry_date",
  "shop_establishment_expiry_date",
  "other_expiry_date",
] as const;

const DOC_TYPE_PREFIXES = [
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "other",
  "bank_proof",
  "pharmacist_certificate",
  "pharmacy_council_registration",
] as const;

function docPrefixesTouchedByKeys(keys: string[]): (typeof DOC_TYPE_PREFIXES)[number][] {
  const out: (typeof DOC_TYPE_PREFIXES)[number][] = [];
  for (const pf of DOC_TYPE_PREFIXES) {
    const prefix = `${pf}_`;
    if (keys.some((k) => k.startsWith(prefix))) out.push(pf);
  }
  return out;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }

    const access = await authenticateMerchantStoreForId(request, storeId);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    // Normalise all document numbers: trim + UPPERCASE so DB is consistent
    for (const key of DOC_NUMBER_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v == null || v === "") {
          updates[key] = null;
        } else {
          const trimmed = String(v).trim();
          updates[key] =
            key === "aadhaar_document_number"
              ? maskAadhaarNumber(trimmed)
              : trimmed.toUpperCase();
        }
      }
    }
    for (const key of DOC_URL_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        updates[key] = v == null || v === "" ? null : String(v).trim();
      }
    }
    for (const key of DOC_NAME_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v == null || v === "") {
          updates[key] = null;
        } else if (key === "gst_effective_registration_date") {
          updates[key] = pickGstFetchedBusinessInfo({
            date_of_registration: String(v).trim(),
          }).effective_registration_date;
        } else {
          updates[key] = String(v).trim();
        }
      }
    }
    for (const key of DOC_DATE_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v == null || v === "") {
          updates[key] = null;
        } else {
          const s = String(v).trim();
          // Expecting YYYY-MM-DD from UI; keep only date portion in case a full ISO is sent
          updates[key] = s.length >= 10 ? s.slice(0, 10) : s;
        }
      }
    }

    const sql = getSql() as {
      unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
    };

    // Reject duplicate FSSAI / Drug Licence numbers used by another store.
    if (updates.fssai_document_number != null && updates.fssai_document_number !== "") {
      const digits = String(updates.fssai_document_number).replace(/\D/g, "");
      if (digits.length === 14) {
        const hit = (await sql.unsafe(
          `SELECT store_id FROM merchant_store_documents
            WHERE regexp_replace(coalesce(fssai_document_number, ''), '[^0-9]', '', 'g') = $1
              AND store_id <> $2
            LIMIT 1`,
          [digits, storeId],
        )) as Array<{ store_id: number }>;
        if (hit.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error:
                "This FSSAI number is already registered with another store. Enter a different FSSAI licence number — duplicates are not allowed.",
              code: "DUPLICATE_FSSAI",
            },
            { status: 409 },
          );
        }
      }
    }
    if (
      updates.drug_license_document_number != null &&
      updates.drug_license_document_number !== ""
    ) {
      const drugNorm = String(updates.drug_license_document_number)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (drugNorm.length >= 5) {
        const hit = (await sql.unsafe(
          `SELECT store_id FROM merchant_store_documents
            WHERE upper(regexp_replace(coalesce(drug_license_document_number, ''), '\\s+', '', 'g')) = $1
              AND store_id <> $2
            LIMIT 1`,
          [drugNorm, storeId],
        )) as Array<{ store_id: number }>;
        if (hit.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error:
                "This Drug Licence number is already registered with another store. Enter a different Drug Licence number — duplicates are not allowed.",
              code: "DUPLICATE_DRUG_LICENSE",
            },
            { status: 409 },
          );
        }
      }
    }

    await ensureMerchantStoreDocumentsStep4JsonColumns();

    // Load existing row for number-change invalidation + metadata merge
    const existingRows = await sql.unsafe(
      `SELECT pan_document_number, gst_document_number,
              pan_is_verified, gst_is_verified,
              pan_verified_at, gst_verified_at,
              pan_verification_method, gst_verification_method,
              pan_holder_name,
              pan_document_metadata, gst_document_metadata,
              extracted_data_summary
         FROM merchant_store_documents WHERE store_id = $1 LIMIT 1`,
      [storeId]
    );
    const existing = (Array.isArray(existingRows) ? existingRows[0] : existingRows) as
      | Record<string, unknown>
      | undefined;

    const applyVerifyFlag = (
      prefix: "pan" | "gst",
      isVerifiedKey: string,
      verifiedAtKey: string,
      methodKey: string,
      numberKey: string,
      detailsKey: string,
      metadataKey: string,
      summaryKind: "pan" | "gstin",
    ) => {
      const numberInBody = body[numberKey] !== undefined;
      const flagInBody = body[isVerifiedKey] !== undefined;
      if (!numberInBody && !flagInBody) return;

      const newNum = String(updates[numberKey] ?? body[numberKey] ?? "").trim().toUpperCase();
      const oldNum = String(existing?.[numberKey] ?? "").trim().toUpperCase();
      const numberChanged = !!(newNum && oldNum && newNum !== oldNum);

      if (numberChanged || body[isVerifiedKey] === false) {
        updates[isVerifiedKey] = false;
        updates[verifiedAtKey] = null;
        updates[methodKey] = null;
        if (prefix === "gst") {
          updates.gst_legal_business_name = null;
          updates.gst_principal_place_of_business = null;
          updates.gst_effective_registration_date = null;
        }
        if (existing?.[metadataKey]) {
          const meta = asRecord(existing[metadataKey]);
          if (meta.auto_verification) {
            const { auto_verification: _drop, ...rest } = meta;
            updates[metadataKey] = rest;
          }
        }
        return;
      }

      const wantVerified =
        body[isVerifiedKey] === true ||
        (Boolean(existing?.[isVerifiedKey]) && newNum && newNum === oldNum);

      if (!wantVerified) return;

      updates[isVerifiedKey] = true;
      updates[verifiedAtKey] =
        body[verifiedAtKey] || existing?.[verifiedAtKey] || new Date().toISOString();
      updates[methodKey] =
        body[methodKey] || existing?.[methodKey] || "CASHFREE_AUTO";

      const details =
        (body[detailsKey] && typeof body[detailsKey] === "object"
          ? (body[detailsKey] as Record<string, unknown>)
          : null) ||
        verifiedDetailsForUi(
          true,
          existing?.[metadataKey],
          prefix === "pan"
            ? String(updates.pan_holder_name ?? existing?.pan_holder_name ?? "") || null
            : null,
          asRecord(existing?.extracted_data_summary)[summaryKind],
        ) ||
        {};

      if (prefix === "gst") {
        const gstInfo = pickGstFetchedBusinessInfo({
          ...details,
          gst_legal_business_name:
            updates.gst_legal_business_name ?? existing?.gst_legal_business_name,
          gst_principal_place_of_business:
            updates.gst_principal_place_of_business ??
            existing?.gst_principal_place_of_business,
          gst_effective_registration_date:
            updates.gst_effective_registration_date ??
            existing?.gst_effective_registration_date,
        });
        if (gstInfo.legal_business_name && updates.gst_legal_business_name === undefined) {
          updates.gst_legal_business_name = gstInfo.legal_business_name;
        }
        if (
          gstInfo.principal_place_of_business &&
          updates.gst_principal_place_of_business === undefined
        ) {
          updates.gst_principal_place_of_business = gstInfo.principal_place_of_business;
        }
        if (
          gstInfo.effective_registration_date &&
          updates.gst_effective_registration_date === undefined
        ) {
          updates.gst_effective_registration_date = gstInfo.effective_registration_date;
        }
        updates[metadataKey] = mergeAutoVerificationMetadata(existing?.[metadataKey], {
          method: (String(updates[methodKey]) as "CASHFREE_AUTO") || "CASHFREE_AUTO",
          status: "verified",
          verified_at: String(updates[verifiedAtKey]),
          verified_data: mergeGstFetchedIntoVerifiedDetails(details, gstInfo),
          document_number: newNum || oldNum || null,
        });
      } else {
        updates[metadataKey] = mergeAutoVerificationMetadata(existing?.[metadataKey], {
          method: (String(updates[methodKey]) as "CASHFREE_AUTO") || "CASHFREE_AUTO",
          status: "verified",
          verified_at: String(updates[verifiedAtKey]),
          verified_data: details,
          document_number: newNum || oldNum || null,
        });
      }
      updates.extracted_data_summary = mergeExtractedDataSummary(
        (updates.extracted_data_summary as Record<string, unknown> | undefined) ??
          existing?.extracted_data_summary,
        summaryKind,
        {
          verifiedData:
            prefix === "gst"
              ? mergeGstFetchedIntoVerifiedDetails(
                  details,
                  pickGstFetchedBusinessInfo({
                    ...details,
                    gst_legal_business_name: updates.gst_legal_business_name,
                    gst_principal_place_of_business:
                      updates.gst_principal_place_of_business,
                    gst_effective_registration_date:
                      updates.gst_effective_registration_date,
                  }),
                )
              : details,
          method: updates[methodKey],
          status: "verified",
        },
      );
    };

    applyVerifyFlag(
      "pan",
      "pan_is_verified",
      "pan_verified_at",
      "pan_verification_method",
      "pan_document_number",
      "pan_verified_details",
      "pan_document_metadata",
      "pan",
    );
    applyVerifyFlag(
      "gst",
      "gst_is_verified",
      "gst_verified_at",
      "gst_verification_method",
      "gst_document_number",
      "gst_verified_details",
      "gst_document_metadata",
      "gstin",
    );

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        message: "No document fields to update",
      });
    }

    // Upsert so that documents row is created if it doesn't exist yet
    const keys = Object.keys(updates);
    const columns = ["store_id", ...keys];
    const isJsonbKey = (k: string) =>
      k.endsWith("_metadata") ||
      k === "extracted_data_summary" ||
      k === "step4_rejection_details" ||
      k === "step4_resubmission_flags";
    const insertPlaceholders = columns
      .map((col, i) => (isJsonbKey(col) ? `$${i + 1}::jsonb` : `$${i + 1}`))
      .join(", ");
    const insertValues = [
      storeId,
      ...keys.map((k) => {
        const v = updates[k];
        if (v != null && typeof v === "object") return JSON.stringify(v);
        return v;
      }),
    ];

    const updateSetClause = keys
      .map((k) => {
        if (isJsonbKey(k)) {
          return `${k} = EXCLUDED.${k}`;
        }
        return `${k} = EXCLUDED.${k}`;
      })
      .join(", ");

    await sql.unsafe(
      `INSERT INTO merchant_store_documents (${columns.join(
        ", "
      )}) VALUES (${insertPlaceholders})
       ON CONFLICT (store_id) DO UPDATE
       SET ${updateSetClause}`,
      insertValues
    );

    const touchedPrefixes = docPrefixesTouchedByKeys(keys);
    for (const pf of touchedPrefixes) {
      // Don't wipe auto-verify when Save is explicitly keeping *_is_verified true.
      if (pf === "pan" && updates.pan_is_verified === true) continue;
      if (pf === "gst" && updates.gst_is_verified === true) continue;
      const chk = await sql.unsafe(
        `SELECT ${pf}_rejection_reason AS rr, step4_rejection_details AS rd FROM merchant_store_documents WHERE store_id = $1 LIMIT 1`,
        [storeId]
      );
      const row = Array.isArray(chk) ? chk[0] : chk;
      if (!row || typeof row !== "object") continue;
      const rr = "rr" in row ? (row as { rr: unknown }).rr : null;
      if (rr == null || String(rr).trim() === "") continue;
      const rd = "rd" in row ? (row as { rd: unknown }).rd : null;
      const detail = rejectionDetailForDocType(rd, pf);
      if (rejectionRequiresNewFileUpload(detail)) continue;
      await sql.unsafe(
        `UPDATE merchant_store_documents SET
          ${pf}_rejection_reason = null,
          ${pf}_is_verified = false,
          ${pf}_verified_at = null,
          ${pf}_verified_by = null,
          step4_rejection_details = COALESCE(step4_rejection_details, '{}'::jsonb) - '${pf}',
          step4_resubmission_flags = jsonb_set(COALESCE(step4_resubmission_flags, '{}'::jsonb), ARRAY['${pf}']::text[], 'false'::jsonb, true),
          updated_at = now()
        WHERE store_id = $1`,
        [storeId]
      );
    }

    return NextResponse.json({
      success: true,
      message: "Documents updated",
    });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/documents]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
