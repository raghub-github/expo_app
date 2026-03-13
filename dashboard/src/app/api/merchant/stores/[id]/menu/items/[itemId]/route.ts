/**
 * Items CRUD for dashboard store menu.
 * PUT/DELETE /api/merchant/stores/[id]/menu/items/[itemId]
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function assertAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Merchant dashboard access required" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const };
}

export async function PUT(
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
    const access = await assertAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sql = getSql();
    const [existing] = await sql`
      SELECT item_name, item_description, category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, preparation_time_minutes, serves, serves_label,
             short_name, display_order, item_size_value, item_size_unit, available_for_delivery,
             in_stock, is_active
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId} AND (is_deleted IS NULL OR is_deleted = false)
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    const e = existing as any;
    const item_name = body.item_name !== undefined ? String(body.item_name).trim() : e.item_name;
    if (!item_name) return NextResponse.json({ success: false, error: "item_name required" }, { status: 400 });

    await sql`
      UPDATE merchant_menu_items
      SET item_name = ${item_name},
          item_description = ${body.item_description !== undefined ? body.item_description : e.item_description},
          category_id = ${body.category_id !== undefined ? body.category_id : e.category_id},
          food_type = ${body.food_type !== undefined ? body.food_type : e.food_type},
          spice_level = ${body.spice_level !== undefined ? body.spice_level : e.spice_level},
          cuisine_type = ${body.cuisine_type !== undefined ? body.cuisine_type : e.cuisine_type},
          base_price = ${body.base_price !== undefined ? body.base_price : e.base_price},
          selling_price = ${body.selling_price !== undefined ? body.selling_price : e.selling_price},
          preparation_time_minutes = ${body.preparation_time_minutes !== undefined ? body.preparation_time_minutes : e.preparation_time_minutes},
          serves = ${body.serves !== undefined ? body.serves : e.serves},
          serves_label = ${body.serves_label !== undefined ? body.serves_label : e.serves_label},
          short_name = ${body.short_name !== undefined ? body.short_name : e.short_name},
          display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
          item_size_value = ${body.item_size_value !== undefined ? body.item_size_value : e.item_size_value},
          item_size_unit = ${body.item_size_unit !== undefined ? body.item_size_unit : e.item_size_unit},
          available_for_delivery = ${body.available_for_delivery !== undefined ? body.available_for_delivery : e.available_for_delivery},
          in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
          is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
          updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const sql = getSql();
    const [item] = await sql`
      SELECT id, approval_status::text AS approval_status
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const approvalStatus = (item as any).approval_status as string | null;

    // Approved items: soft delete only (deprecate).
    if (approvalStatus === "APPROVED") {
      const result = await sql`
        UPDATE merchant_menu_items
        SET is_deleted = true, updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
      if ((result as any)?.count === 0) {
        return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, ok: true, mode: "SOFT_DELETE" });
    }

    // Pending / rejected items: hard delete including images and their R2 objects.
    const images = (await sql`
      SELECT id, r2_key
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId}
    `) as { id: number; r2_key: string | null }[];

    await sql.begin(async (trx) => {
      await trx`
        DELETE FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId}
      `;
      await trx`
        DELETE FROM merchant_menu_items
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
    });

    if (images.length > 0) {
      try {
        const { deleteFileFromR2 } = await import("../../../../../../../../backend/src/services/r2.service");
        await Promise.all(
          images
            .map((img) => img.r2_key)
            .filter((key): key is string => !!key)
            .map((key) => deleteFileFromR2(key).catch(() => undefined))
        );
      } catch (e) {
        console.error("[DELETE items/[itemId]] R2 cleanup failed", e);
      }
    }

    return NextResponse.json({ success: true, ok: true, mode: "HARD_DELETE" });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

