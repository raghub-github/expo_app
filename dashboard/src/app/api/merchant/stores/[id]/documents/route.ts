/**
 * GET /api/merchant/stores/[id]/documents
 * Returns the full `merchant_store_documents` row for the store (same shape as verification-data `documents`).
 *
 * PATCH /api/merchant/stores/[id]/documents
 * Update store document numbers (agent verification edits).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { ensureMerchantStoreDocumentsStep4JsonColumns } from "@/lib/db/ensure-step4-resubmission-flags-column";
import { rejectionDetailForDocType, rejectionRequiresNewFileUpload } from "@/lib/merchant-store-document-rejection";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
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

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Merchant dashboard access required" },
        { status: 403 }
      );
    }
    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

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

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Merchant dashboard access required" },
        { status: 403 }
      );
    }
    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, string | null> = {};

    // Normalise all document numbers: trim + UPPERCASE so DB is consistent
    for (const key of DOC_NUMBER_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        if (v == null || v === "") {
          updates[key] = null;
        } else {
          const trimmed = String(v).trim();
          updates[key] = trimmed.toUpperCase();
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
        updates[key] = v == null || v === "" ? null : String(v).trim();
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
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        message: "No document fields to update",
      });
    }

    const sql = getSql() as {
      unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
    };
    const keys = Object.keys(updates);

    await ensureMerchantStoreDocumentsStep4JsonColumns();

    // Upsert so that documents row is created if it doesn't exist yet
    const columns = ["store_id", ...keys];
    const insertPlaceholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const insertValues = [storeId, ...Object.values(updates)];

    const updateSetClause = keys
      .map((k) => `${k} = EXCLUDED.${k}`)
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
