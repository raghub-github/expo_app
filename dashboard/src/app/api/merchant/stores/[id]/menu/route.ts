/**
 * GET /api/merchant/stores/[id]/menu
 * Returns menu categories and items for the store (dashboard MX view).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
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
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sql = getSql();
    const categories = await sql`
      SELECT id, store_id, category_name, category_description, category_image_url,
             parent_category_id, cuisine_id, display_order, is_active, created_at, updated_at
      FROM merchant_menu_categories
      WHERE store_id = ${storeId}
        AND COALESCE(is_deleted, FALSE) = FALSE
      ORDER BY parent_category_id NULLS FIRST, display_order ASC, id ASC
    `;

    const items = await sql`
      SELECT id, store_id, item_id, item_name, item_description, item_image_url,
             category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, discount_percentage, tax_percentage,
             in_stock, is_active, is_deleted, display_order,
             has_customizations, has_addons, has_variants,
             is_popular, is_recommended,
             preparation_time_minutes, packaging_charges, serves, serves_label, item_size_value, item_size_unit,
             approval_status::text,
             (SELECT EXISTS(
               SELECT 1 FROM merchant_menu_item_change_requests r
               WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING'
             )) AS has_pending_change_request,
             (SELECT request_type::text FROM merchant_menu_item_change_requests r
               WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING'
               ORDER BY r.created_at DESC
               LIMIT 1
             ) AS pending_change_request_type
      FROM merchant_menu_items
      WHERE store_id = ${storeId}
      ORDER BY category_id NULLS FIRST, display_order ASC, id ASC
    `;

    return NextResponse.json({
      success: true,
      store: {
        id: storeId,
        store_id: (store as any).store_id ?? null,
        store_name: (store as any).store_name ?? null,
        avg_preparation_time_minutes: (store as any).avg_preparation_time_minutes ?? null,
        packaging_charge_amount: (store as any).packaging_charge_amount ?? null,
      },
      categories,
      items,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
