/**
 * GET /api/merchant/stores/[id]/media?scope=MENU_REFERENCE
 * POST /api/merchant/stores/[id]/media/upload - upload menu file (image, CSV, XLS)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
export const runtime = "nodejs";

export type MenuMediaFile = {
  id: number;
  store_id: number;
  media_scope: string;
  original_file_name: string | null;
  r2_key: string;
  public_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  verification_status: string;
  created_at: string;
};

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

    const scope =
      request.nextUrl.searchParams.get("scope") || "MENU_REFERENCE";

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

    let files: MenuMediaFile[] = [];
    try {
      const sql = getSql();
      const rows = await sql`
        SELECT id, store_id, media_scope, original_file_name, r2_key, public_url,
               mime_type, file_size_bytes, verification_status, created_at
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = ${scope}
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      files = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
        id: Number(r.id),
        store_id: Number(r.store_id),
        media_scope: String(r.media_scope),
        original_file_name: r.original_file_name != null ? String(r.original_file_name) : null,
        r2_key: String(r.r2_key),
        public_url: r.public_url != null ? String(r.public_url) : null,
        mime_type: r.mime_type != null ? String(r.mime_type) : null,
        file_size_bytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
        verification_status: String(r.verification_status ?? "PENDING"),
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }));
    } catch (e) {
      console.warn("[GET /api/merchant/stores/[id]/media] query failed (table may not exist):", e);
    }

    return NextResponse.json({ success: true, files });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/media]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
