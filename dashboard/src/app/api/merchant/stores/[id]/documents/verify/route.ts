/**
 * POST /api/merchant/stores/[id]/documents/verify
 * Mark a single document type as verified. Updates merchant_store_documents and keeps
 * verification in sync (step verification is completed when all docs are verified via main button).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const DOC_TYPES = ["pan", "gst", "aadhaar", "fssai", "drug_license"] as const;

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
    const docType = body.docType as string | undefined;
    const action = (body.action as string) === "reject" ? "reject" : "verify";
    const rejectionReason =
      typeof body.rejection_reason === "string" ? body.rejection_reason.trim() || null : null;

    if (!docType || !DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: "Invalid docType. Use: pan, gst, aadhaar, fssai, drug_license" },
        { status: 400 }
      );
    }

    const sql = getSql();

    if (action === "reject") {
      switch (docType) {
        case "pan":
          await sql`
            UPDATE merchant_store_documents
            SET pan_is_verified = false, pan_verified_at = null, pan_verified_by = null, pan_rejection_reason = ${rejectionReason}
            WHERE store_id = ${storeId}
          `;
          break;
        case "gst":
          await sql`
            UPDATE merchant_store_documents
            SET gst_is_verified = false, gst_verified_at = null, gst_verified_by = null, gst_rejection_reason = ${rejectionReason}
            WHERE store_id = ${storeId}
          `;
          break;
        case "aadhaar":
          await sql`
            UPDATE merchant_store_documents
            SET aadhaar_is_verified = false, aadhaar_verified_at = null, aadhaar_verified_by = null, aadhaar_rejection_reason = ${rejectionReason}
            WHERE store_id = ${storeId}
          `;
          break;
        case "fssai":
          await sql`
            UPDATE merchant_store_documents
            SET fssai_is_verified = false, fssai_verified_at = null, fssai_verified_by = null, fssai_rejection_reason = ${rejectionReason}
            WHERE store_id = ${storeId}
          `;
          break;
        case "drug_license":
          await sql`
            UPDATE merchant_store_documents
            SET drug_license_is_verified = false, drug_license_verified_at = null, drug_license_verified_by = null, drug_license_rejection_reason = ${rejectionReason}
            WHERE store_id = ${storeId}
          `;
          break;
        default:
          return NextResponse.json(
            { success: false, error: "Invalid docType" },
            { status: 400 }
          );
      }
      return NextResponse.json({
        success: true,
        docType,
        action: "reject",
        message: "Document marked as rejected.",
      });
    }

    switch (docType) {
      case "pan":
        await sql`
          UPDATE merchant_store_documents
          SET pan_is_verified = true, pan_verified_at = now(), pan_verified_by = ${verifiedBy}, pan_rejection_reason = null
          WHERE store_id = ${storeId}
        `;
        break;
      case "gst":
        await sql`
          UPDATE merchant_store_documents
          SET gst_is_verified = true, gst_verified_at = now(), gst_verified_by = ${verifiedBy}, gst_rejection_reason = null
          WHERE store_id = ${storeId}
        `;
        break;
      case "aadhaar":
        await sql`
          UPDATE merchant_store_documents
          SET aadhaar_is_verified = true, aadhaar_verified_at = now(), aadhaar_verified_by = ${verifiedBy}, aadhaar_rejection_reason = null
          WHERE store_id = ${storeId}
        `;
        break;
      case "fssai":
        await sql`
          UPDATE merchant_store_documents
          SET fssai_is_verified = true, fssai_verified_at = now(), fssai_verified_by = ${verifiedBy}, fssai_rejection_reason = null
          WHERE store_id = ${storeId}
        `;
        break;
      case "drug_license":
        await sql`
          UPDATE merchant_store_documents
          SET drug_license_is_verified = true, drug_license_verified_at = now(), drug_license_verified_by = ${verifiedBy}, drug_license_rejection_reason = null
          WHERE store_id = ${storeId}
        `;
        break;
      default:
        return NextResponse.json(
          { success: false, error: "Invalid docType" },
          { status: 400 }
        );
    }

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
