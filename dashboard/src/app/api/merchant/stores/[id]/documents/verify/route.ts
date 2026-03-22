/**
 * POST /api/merchant/stores/[id]/documents/verify
 * Mark a single document type as verified or rejected. Updates merchant_store_documents;
 * step 4 completion still uses the main "Mark as verified" flow when all required docs pass.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { ensureMerchantStoreDocumentsStep4JsonColumns } from "@/lib/db/ensure-step4-resubmission-flags-column";
import {
  buildStoredRejectionReason,
  parseRejectionIssuesFromBody,
  rejectionDetailForDocType,
  rejectionRequiresNewFileUpload,
} from "@/lib/merchant-store-document-rejection";

export const runtime = "nodejs";

/** Column family prefix in merchant_store_documents (must match DB columns). */
const DOC_TYPES = [
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "pharmacist_certificate",
  "pharmacy_council_registration",
  "bank_proof",
  "other",
] as const;

type DocType = (typeof DOC_TYPES)[number];

function isDocType(s: string): s is DocType {
  return (DOC_TYPES as readonly string[]).includes(s);
}

export async function POST(
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
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
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

    const systemUser = await getSystemUserByEmail(user.email);
    const verifiedBy = systemUser?.id ?? null;

    const body = await request.json().catch(() => ({}));
    const docTypeRaw = body.docType as string | undefined;
    const action = (body.action as string) === "reject" ? "reject" : "verify";
    let rejectionReason =
      typeof body.rejection_reason === "string" ? body.rejection_reason.trim() || null : null;

    if (!docTypeRaw || !isDocType(docTypeRaw)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid docType. Use one of: ${DOC_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const docType = docTypeRaw;
    const rejectionIssues = parseRejectionIssuesFromBody(body);
    const rejectionNote =
      typeof body.rejection_note === "string" ? body.rejection_note.trim() : "";

    if (action === "reject") {
      if (rejectionIssues.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Select at least one rejection category (what is wrong with this document).",
          },
          { status: 400 }
        );
      }
      if (!rejectionReason) {
        rejectionReason = buildStoredRejectionReason(rejectionIssues, rejectionNote || undefined);
      } else if (rejectionNote) {
        rejectionReason = `${rejectionReason}${rejectionReason.endsWith(".") ? "" : "."} ${rejectionNote}`;
      }
    }

    const sql = getSql() as {
      (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
      unsafe: (query: string, parameters?: unknown[]) => Promise<unknown[]>;
    };

    await ensureMerchantStoreDocumentsStep4JsonColumns();

    await sql`
      INSERT INTO merchant_store_documents (store_id)
      VALUES (${storeId})
      ON CONFLICT (store_id) DO NOTHING
    `;

    const pf = docType;

    if (action === "verify") {
      const chkRows = await sql.unsafe(
        `SELECT ${pf}_rejection_reason AS rr, step4_resubmission_flags AS flags, step4_rejection_details AS rd FROM merchant_store_documents WHERE store_id = $1 LIMIT 1`,
        [storeId]
      );
      const chk0 = Array.isArray(chkRows) ? chkRows[0] : chkRows;
      const rr =
        chk0 && typeof chk0 === "object" && chk0 !== null && "rr" in chk0 && (chk0 as { rr: unknown }).rr != null
          ? String((chk0 as { rr: unknown }).rr).trim()
          : "";
      const rawFlags =
        chk0 && typeof chk0 === "object" && chk0 !== null && "flags" in chk0
          ? (chk0 as { flags: unknown }).flags
          : null;
      let resubmitted = false;
      if (rawFlags && typeof rawFlags === "object" && rawFlags !== null) {
        const v = (rawFlags as Record<string, unknown>)[pf];
        resubmitted = v === true || v === "true";
      }
      const rdRoot =
        chk0 && typeof chk0 === "object" && chk0 !== null && "rd" in chk0
          ? (chk0 as { rd: unknown }).rd
          : null;
      const detail = rejectionDetailForDocType(rdRoot, pf);
      const needsNewFile = rejectionRequiresNewFileUpload(detail);
      if (rr && !resubmitted && needsNewFile) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This document is still marked rejected for the uploaded file. Ask the store to upload a new document image on the partner portal, then verify again.",
          },
          { status: 409 }
        );
      }
    }

    if (action === "reject") {
      const detailPayload = JSON.stringify({
        issues: rejectionIssues,
        ...(rejectionNote ? { note: rejectionNote } : {}),
      });
      await sql.unsafe(
        `UPDATE merchant_store_documents SET
          ${pf}_is_verified = false,
          ${pf}_verified_at = null,
          ${pf}_verified_by = null,
          ${pf}_rejection_reason = $1,
          step4_rejection_details = jsonb_set(COALESCE(step4_rejection_details, '{}'::jsonb), ARRAY['${pf}']::text[], $2::jsonb, true),
          step4_resubmission_flags = jsonb_set(COALESCE(step4_resubmission_flags, '{}'::jsonb), ARRAY['${pf}']::text[], 'false'::jsonb, true),
          updated_at = now()
        WHERE store_id = $3`,
        [rejectionReason, detailPayload, storeId]
      );
      return NextResponse.json({
        success: true,
        docType,
        action: "reject",
        message: "Document marked as rejected.",
      });
    }

    await sql.unsafe(
      `UPDATE merchant_store_documents SET
        ${pf}_is_verified = true,
        ${pf}_verified_at = now(),
        ${pf}_verified_by = $1,
        ${pf}_rejection_reason = null,
        step4_rejection_details = COALESCE(step4_rejection_details, '{}'::jsonb) - '${pf}',
        step4_resubmission_flags = jsonb_set(COALESCE(step4_resubmission_flags, '{}'::jsonb), ARRAY['${pf}']::text[], 'false'::jsonb, true),
        updated_at = now()
      WHERE store_id = $2`,
      [verifiedBy, storeId]
    );

    return NextResponse.json({
      success: true,
      docType,
      message: "Document marked as verified.",
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/documents/verify]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Verify failed" },
      { status: 500 }
    );
  }
}
