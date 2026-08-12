/**
 * GET /api/merchant/stores/[id]/menu
 * Returns menu categories and items for the store (dashboard MX view).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { expireTimedMenuOutOfStockForStore } from "@/lib/menu-oos-expiry";
import {
  fetchCustomizationsForMenuItems,
  fetchVariantsForMenuItems,
} from "@/lib/menu-item-detail-sql";

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
    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sql = getSql();
    await expireTimedMenuOutOfStockForStore(sql, storeId);
    const categories = await sql`
      SELECT id, store_id, category_name, category_description, category_image_url,
             parent_category_id, cuisine_id, display_order, is_active,
             out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at,
             created_at, updated_at
      FROM merchant_menu_categories
      WHERE store_id = ${storeId}
        AND COALESCE(is_deleted, FALSE) = FALSE
      ORDER BY parent_category_id NULLS FIRST, display_order ASC, id ASC
    `;
    const categoryLineageRows = await sql`
      SELECT id, parent_category_id, COALESCE(is_deleted, FALSE) AS is_deleted
      FROM merchant_menu_categories
      WHERE store_id = ${storeId}
    `;
    type CategoryLineageRow = { id: number; parent_category_id: number | null; is_deleted: boolean };
    const lineageById = new Map<number, CategoryLineageRow>();
    for (const row of categoryLineageRows as unknown as CategoryLineageRow[])
      lineageById.set(Number(row.id), row);
    const liveCategoryIds = new Set<number>(
      (categories as unknown as Array<{ id: number }>).map((c) => Number(c.id))
    );
    const resolveLiveParent = (categoryId: number, directParentId: number | null): number | null => {
      let cursor = directParentId;
      const visited = new Set<number>([categoryId]);
      while (cursor != null && Number.isFinite(cursor) && !visited.has(cursor)) {
        visited.add(cursor);
        const parent = lineageById.get(Number(cursor));
        if (!parent) return null;
        if (!parent.is_deleted && liveCategoryIds.has(Number(parent.id))) return Number(parent.id);
        cursor = parent.parent_category_id == null ? null : Number(parent.parent_category_id);
      }
      return null;
    };
    const normalizedCategories = (categories as unknown as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      parent_category_id: resolveLiveParent(
        Number(c.id),
        c.parent_category_id == null ? null : Number(c.parent_category_id)
      ),
    }));

    const items = await sql`
      SELECT id, store_id, item_id, item_name, item_description, item_image_url,
             category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, discount_percentage, tax_percentage,
             in_stock, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at,
             is_active, is_deleted, display_order,
             has_customizations,
             (
               COALESCE(has_addons, FALSE)
               OR EXISTS(
                 SELECT 1 FROM merchant_item_modifier_groups img
                 WHERE img.menu_item_id = merchant_menu_items.id
               )
             ) AS has_addons,
             has_variants,
             is_popular, is_recommended,
             preparation_time_minutes, packaging_charges, serves, serves_label, item_size_value, item_size_unit,
             available_for_delivery,
             weight_per_serving, weight_per_serving_unit, calories_kcal,
             protein, protein_unit, carbohydrates, carbohydrates_unit,
             fat, fat_unit, fibre, fibre_unit, item_tags, allergens,
             approval_status::text,
             rejection_reason,
             (
               SELECT UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING')))
               FROM merchant_menu_item_images img
               WHERE img.menu_item_id = merchant_menu_items.id AND img.is_primary = true
               LIMIT 1
             ) AS primary_image_moderation_status,
             (SELECT EXISTS(
               SELECT 1 FROM merchant_menu_item_change_requests r
               WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING'
             )) AS has_pending_change_request,
             (SELECT request_type::text FROM merchant_menu_item_change_requests r
               WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING'
               ORDER BY r.created_at DESC
               LIMIT 1
             ) AS pending_change_request_type
             ,
             (
               SELECT COALESCE(
                 json_agg(
                   json_build_object(
                     'id', img.id,
                     'modifier_group_id', img.modifier_group_id,
                     'display_order', img.display_order,
                     'title', mg.title,
                     'description', mg.description,
                     'is_required', mg.is_required,
                     'min_selection', mg.min_selection,
                     'max_selection', mg.max_selection,
                     'options_count', (
                       SELECT COUNT(*)::int FROM merchant_modifier_options mo
                       WHERE mo.modifier_group_id = img.modifier_group_id
                     )
                   )
                   ORDER BY img.display_order ASC, img.id ASC
                 ),
                 '[]'::json
               )
               FROM merchant_item_modifier_groups img
               INNER JOIN merchant_modifier_groups mg ON mg.id = img.modifier_group_id
               WHERE img.menu_item_id = merchant_menu_items.id
                 AND mg.store_id = ${storeId}
             ) AS linked_modifier_groups
      FROM merchant_menu_items
      WHERE store_id = ${storeId}
      ORDER BY category_id NULLS FIRST, display_order ASC, id ASC
    `;

    const itemRows = items as unknown as Array<Record<string, unknown>>;
    const menuItemIds = itemRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    const [variantRows, customizationRows] = await Promise.all([
      fetchVariantsForMenuItems(sql, menuItemIds),
      fetchCustomizationsForMenuItems(sql, menuItemIds),
    ]);

    const variantsByItemId = new Map<number, Record<string, unknown>[]>();
    for (const v of variantRows) {
      const itemId = Number(v.menu_item_id);
      if (!Number.isFinite(itemId)) continue;
      const { menu_item_id: _mid, ...rest } = v;
      const list = variantsByItemId.get(itemId) ?? [];
      list.push(rest);
      variantsByItemId.set(itemId, list);
    }

    const customizationsByItemId = new Map<number, Record<string, unknown>[]>();
    for (const c of customizationRows) {
      const itemId = Number(c.menu_item_id);
      if (!Number.isFinite(itemId)) continue;
      const list = customizationsByItemId.get(itemId) ?? [];
      list.push(c);
      customizationsByItemId.set(itemId, list);
    }

    const itemsWithOptions = itemRows.map((row) => {
      const id = Number(row.id);
      return {
        ...row,
        variants: variantsByItemId.get(id) ?? [],
        customizations: customizationsByItemId.get(id) ?? [],
      };
    });

    return NextResponse.json({
      success: true,
      store: {
        id: storeId,
        store_id: (store as any).store_id ?? null,
        store_name: (store as any).store_name ?? null,
        avg_preparation_time_minutes: (store as any).avg_preparation_time_minutes ?? null,
        packaging_charge_amount: (store as any).packaging_charge_amount ?? null,
      },
      categories: normalizedCategories,
      items: itemsWithOptions,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
