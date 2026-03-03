/**
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

export const runtime = "nodejs";

const DOC_NUMBER_KEYS = [
  "pan_document_number",
  "gst_document_number",
  "aadhaar_document_number",
  "fssai_document_number",
  "drug_license_document_number",
] as const;

const DOC_URL_KEYS = [
  "pan_document_url",
  "gst_document_url",
  "aadhaar_document_url",
  "fssai_document_url",
  "drug_license_document_url",
] as const;

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
    for (const key of DOC_NUMBER_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        updates[key] = v == null || v === "" ? null : String(v).trim();
      }
    }
    for (const key of DOC_URL_KEYS) {
      if (body[key] !== undefined) {
        const v = body[key];
        updates[key] = v == null || v === "" ? null : String(v).trim();
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({
        success: true,
        message: "No document fields to update",
      });
    }

    const sql = getSql() as { unsafe: (q: string, v?: unknown[]) => Promise<unknown[]> };
    const keys = Object.keys(updates);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = [...Object.values(updates), storeId];
    await sql.unsafe(
      `UPDATE merchant_store_documents SET ${setClause} WHERE store_id = $${keys.length + 1}`,
      values
    );

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
