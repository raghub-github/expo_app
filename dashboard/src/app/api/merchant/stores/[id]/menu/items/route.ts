/**
 * Items CRUD for dashboard store menu.
 * POST /api/merchant/stores/[id]/menu/items
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import {
  bodyBool,
  bodyNum,
  bodyNumOrNull,
  bodyOptionalStr,
  bodyTextArrayOrNull,
} from "@/lib/db/sql-json-body";
import { ulid } from "ulid";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { enforceStorePlanLimits } from "@/lib/db/operations/menu-category-rules";
import { normalizeSizeWrite, numericSizeOrNull } from "@/lib/menu-size-preset";
import { itemNameMatchKey } from "@/lib/menu-xlsx-import";
import { collapseDuplicateMenuItems } from "@/lib/collapse-duplicate-menu-items";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
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
    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }
    if (!access.can_update_menu) {
      return NextResponse.json({ success: false, error: "Menu update permission required" }, { status: 403 });
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const item_name = String(body.item_name ?? "").trim();
    if (!item_name) return NextResponse.json({ success: false, error: "item_name required" }, { status: 400 });

    const category_id = body.category_id != null ? Number(body.category_id) : null;
    if (!category_id || !Number.isFinite(category_id)) {
      return NextResponse.json({ success: false, error: "category_id required" }, { status: 400 });
    }

    const base_price = Number(body.base_price ?? 0);
    const selling_price = Number(body.selling_price ?? base_price);
    if (!Number.isFinite(base_price) || base_price < 0 || !Number.isFinite(selling_price) || selling_price < 0) {
      return NextResponse.json({ success: false, error: "Invalid price" }, { status: 400 });
    }

    const itemId = ulid();
    const item_description = bodyOptionalStr(body.item_description);
    const food_type = bodyOptionalStr(body.food_type);
    const spice_level = bodyOptionalStr(body.spice_level);
    const cuisine_type = bodyOptionalStr(body.cuisine_type);
    const preparation_time_minutes = bodyNumOrNull(body.preparation_time_minutes);
    const packaging_charges = body.packaging_charges === null ? null : bodyNumOrNull(body.packaging_charges);
    const serves = bodyNumOrNull(body.serves);
    const serves_label = bodyOptionalStr(body.serves_label);
    const short_name = bodyOptionalStr(body.short_name);
    const display_order = bodyNum(body.display_order, 0);
    const item_size = normalizeSizeWrite({
      size_preset: body.size_preset,
      size_value: body.item_size_value,
      size_unit: body.item_size_unit,
    });
    const item_size_value = numericSizeOrNull(item_size.size_value);
    const item_size_unit = item_size.size_unit;
    const size_preset = item_size.size_preset;
    const available_for_delivery = bodyBool(body.available_for_delivery, true);
    const in_stock = bodyBool(body.in_stock, true);
    const is_active = bodyBool(body.is_active, true);
    const is_popular = bodyBool(body.is_popular, false);
    const is_recommended = bodyBool(body.is_recommended, false);
    const has_customizations = bodyBool(body.has_customizations, false);
    const has_addons = bodyBool(body.has_addons, false);
    const has_variants = bodyBool(body.has_variants, false);

    const allergens = bodyTextArrayOrNull(body.allergens);
    const item_tags = bodyTextArrayOrNull(body.item_tags);
    const weight_per_serving = bodyNumOrNull(body.weight_per_serving);
    const weight_per_serving_unit = bodyOptionalStr(body.weight_per_serving_unit) ?? "grams";
    const calories_kcal = bodyNumOrNull(body.calories_kcal);
    const protein = bodyNumOrNull(body.protein);
    const protein_unit = bodyOptionalStr(body.protein_unit) ?? "mg";
    const carbohydrates = bodyNumOrNull(body.carbohydrates);
    const carbohydrates_unit = bodyOptionalStr(body.carbohydrates_unit) ?? "mg";
    const fat = bodyNumOrNull(body.fat);
    const fat_unit = bodyOptionalStr(body.fat_unit) ?? "mg";
    const fibre = bodyNumOrNull(body.fibre);
    const fibre_unit = bodyOptionalStr(body.fibre_unit) ?? "mg";
    const available_quantity = bodyNumOrNull(body.available_quantity);
    const low_stock_threshold = bodyNumOrNull(body.low_stock_threshold);
    const expiryRaw = bodyOptionalStr(body.expiry_date);
    const expiry_date =
      expiryRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiryRaw) ? expiryRaw : null;

    const sql = getSql();
    await collapseDuplicateMenuItems(sql, storeId);
    const liveItems = await sql<{ id: number; item_id: string; item_name: string }[]>`
      SELECT id, item_id, item_name
      FROM merchant_menu_items
      WHERE store_id = ${storeId}
        AND COALESCE(is_deleted, FALSE) = FALSE
      ORDER BY id ASC
    `;
    const wantKey = itemNameMatchKey(item_name);
    const existing = liveItems.find((r) => itemNameMatchKey(String(r.item_name ?? "")) === wantKey);
    if (existing) {
      const existingId = Number(existing.id);
      await sql`
        UPDATE merchant_menu_items SET
          category_id = ${category_id},
          item_name = ${item_name},
          item_description = ${item_description},
          food_type = ${food_type},
          spice_level = ${spice_level},
          cuisine_type = ${cuisine_type},
          base_price = ${base_price},
          selling_price = ${selling_price},
          preparation_time_minutes = ${preparation_time_minutes},
          packaging_charges = ${packaging_charges},
          serves = ${serves},
          serves_label = ${serves_label},
          short_name = ${short_name},
          display_order = ${display_order},
          item_size_value = ${item_size_value},
          item_size_unit = ${item_size_unit},
          size_preset = ${size_preset},
          available_for_delivery = ${available_for_delivery},
          allergens = ${allergens},
          item_tags = ${item_tags},
          weight_per_serving = ${weight_per_serving},
          weight_per_serving_unit = ${weight_per_serving_unit},
          calories_kcal = ${calories_kcal},
          protein = ${protein},
          protein_unit = ${protein_unit},
          carbohydrates = ${carbohydrates},
          carbohydrates_unit = ${carbohydrates_unit},
          fat = ${fat},
          fat_unit = ${fat_unit},
          fibre = ${fibre},
          fibre_unit = ${fibre_unit},
          in_stock = ${in_stock},
          available_quantity = ${available_quantity},
          low_stock_threshold = ${low_stock_threshold},
          expiry_date = ${expiry_date},
          is_active = ${is_active},
          is_popular = ${is_popular},
          is_recommended = ${is_recommended},
          has_customizations = ${has_customizations},
          has_addons = ${has_addons},
          has_variants = ${has_variants},
          updated_at = NOW()
        WHERE id = ${existingId} AND store_id = ${storeId}
      `;
      try {
        await logStoreActivity({
          storeId,
          section: "menu_item",
          action: "update",
          entityId: existingId,
          entityName: item_name,
          summary: `Agent replaced menu item "${item_name}"`,
          actorType: "agent",
          source: "dashboard",
        });
      } catch (_) {}
      await enforceStorePlanLimits(storeId);
      return NextResponse.json(
        { success: true, id: existingId, item_id: existing.item_id, replaced: true },
        { status: 200 }
      );
    }

    const [row] = await sql`
      INSERT INTO merchant_menu_items (
        store_id, category_id, item_id, item_name, item_description, food_type, spice_level, cuisine_type,
        base_price, selling_price, preparation_time_minutes, packaging_charges, serves, serves_label, short_name, display_order,
        item_size_value, item_size_unit, size_preset, available_for_delivery,
        allergens, item_tags,
        weight_per_serving, weight_per_serving_unit, calories_kcal,
        protein, protein_unit, carbohydrates, carbohydrates_unit,
        fat, fat_unit, fibre, fibre_unit,
        in_stock, available_quantity, low_stock_threshold, expiry_date,
        is_active, is_popular, is_recommended,
        has_customizations, has_addons, has_variants,
        approval_status, approved_at, approved_by,
        created_at, updated_at
      )
      VALUES (
        ${storeId}, ${category_id}, ${itemId}, ${item_name}, ${item_description},
        ${food_type}, ${spice_level}, ${cuisine_type},
        ${base_price}, ${selling_price},
        ${preparation_time_minutes},
        ${packaging_charges},
        ${serves},
        ${serves_label},
        ${short_name},
        ${display_order},
        ${item_size_value},
        ${item_size_unit},
        ${size_preset},
        ${available_for_delivery},
        ${allergens},
        ${item_tags},
        ${weight_per_serving},
        ${weight_per_serving_unit},
        ${calories_kcal},
        ${protein},
        ${protein_unit},
        ${carbohydrates},
        ${carbohydrates_unit},
        ${fat},
        ${fat_unit},
        ${fibre},
        ${fibre_unit},
        ${in_stock},
        ${available_quantity},
        ${low_stock_threshold},
        ${expiry_date},
        ${is_active},
        ${is_popular},
        ${is_recommended},
        ${has_customizations},
        ${has_addons},
        ${has_variants},
        'APPROVED'::merchant_menu_item_approval_status,
        NOW(),
        ${user.email ?? null},
        NOW(),
        NOW()
      )
      RETURNING id, item_id
    `;

    const newId = Number((row as any).id);
    try {
      await logStoreActivity({ storeId, section: "menu_item", action: "create", entityId: newId, entityName: item_name, summary: `Agent created menu item "${item_name}"`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    try {
      await logActionByAuth(user.id, user.email, "MERCHANT", "CREATE", {
        resourceType: "MENU_ITEM",
        resourceId: String(newId),
        actionDetails: { storeId, item_name, item_id: (row as any).item_id },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      });
    } catch (_) {}

    await enforceStorePlanLimits(storeId);

    return NextResponse.json({ success: true, id: newId, item_id: (row as any).item_id }, { status: 201 });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code ?? "") : "";
    if (code === "23505") {
      return NextResponse.json(
        { success: false, error: "An item with this name already exists. Open it and edit instead of adding a duplicate." },
        { status: 409 }
      );
    }
    console.error("[POST /api/merchant/stores/[id]/menu/items]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
