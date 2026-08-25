/**
 * GET /api/merchant/stores/[id]/media?scope=MENU_REFERENCE
 * POST /api/merchant/stores/[id]/media/upload - upload menu file (image, CSV, XLS)
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchantStoreOperator } from "@/lib/merchant-store-route-auth";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { mapRowToMenuMediaFile, type MenuMediaFile } from "@/lib/merchant-menu-media";
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

    const scope =
      request.nextUrl.searchParams.get("scope") || "MENU_REFERENCE";

    const operator = await authenticateMerchantStoreOperator(request);
    if (!operator.ok) return operator.response;
    const user = operator.user;

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email ?? "",
    });

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
        SELECT id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url,
               mime_type, file_size_bytes, verification_status, created_at, menu_reference_image_urls
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = ${scope}
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      files = (Array.isArray(rows) ? rows : [rows]).map((r) =>
        mapRowToMenuMediaFile(r as Record<string, unknown>)
      );
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
