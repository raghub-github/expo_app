/**
 * POST /api/merchant/stores/[id]/menu/items/[itemId]/images
 * Upload menu item image to R2 and set as primary (replace semantics).
 *
 * - Uploads to R2 using key format compatible with backend.
 * - Deletes previous primary image from R2 and DB row.
 * - Inserts new row into merchant_menu_item_images and updates merchant_menu_items.item_image_url.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";
import { validateMenuItemSquareImage } from "@/lib/menuItemImageValidation";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/** Same as documents upload: never persist absolute R2/CDN URLs (portable, non-expiring proxy). */
function buildStoredImageUrl(r2Key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = (m?.[1] || "jpg").toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const sql = getSql();
    const [itemRow] = await sql`
      SELECT id, item_id
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId} AND (is_deleted IS NULL OR is_deleted = false)
      LIMIT 1
    `;
    if (!itemRow) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    const itemPublicId = String((itemRow as any).item_id);
    const storePublicId = String((store as any).store_id ?? storeId);

    const ext = extFromName(file.name);
    const fileId = randomUUID();
    const r2Key = `merchant-menu/stores/${storePublicId}/items/${itemPublicId}/images/${fileId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const dim = validateMenuItemSquareImage(Buffer.from(arrayBuffer));
    if (!dim.ok) {
      return NextResponse.json({ success: false, error: dim.error }, { status: 400 });
    }

    await uploadWithKey(file, r2Key);

    const imageUrl = buildStoredImageUrl(r2Key);

    const [existingPrimary] = await sql`
      SELECT id, r2_key FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId} AND is_primary = true
      LIMIT 1
    `;
    if (existingPrimary) {
      const oldKey = (existingPrimary as any).r2_key as string | null;
      if (oldKey) {
        try {
          await deleteDocument(oldKey);
        } catch {
          // continue
        }
      }
      await sql`DELETE FROM merchant_menu_item_images WHERE id = ${(existingPrimary as any).id}`;
    }

    await sql`UPDATE merchant_menu_item_images SET is_primary = false WHERE menu_item_id = ${menuItemId}`;
    const [imgRow] = await sql`
      INSERT INTO merchant_menu_item_images (menu_item_id, image_url, r2_key, is_primary, format, display_order)
      VALUES (${menuItemId}, ${imageUrl}, ${r2Key}, true, ${ext}, 0)
      RETURNING id
    `;
    await sql`
      UPDATE merchant_menu_items
      SET item_image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;

    return NextResponse.json(
      { success: true, id: Number((imgRow as any).id), image_url: imageUrl, r2_key: r2Key },
      { status: 201 }
    );
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items/[itemId]/images]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

