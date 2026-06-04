/**
 * Items CRUD for dashboard store menu.
 * GET/PUT/DELETE /api/merchant/stores/[id]/menu/items/[itemId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import {
  mergeBool,
  mergeNum,
  mergeNumNullable,
  mergeOptionalStr,
  mergeStringArray,
  mergeStringArrayOrComma,
} from "@/lib/db/sql-json-body";
import { assertStoreAccess } from "../../assert-store-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";
import { deleteDocument } from "@/lib/services/r2";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import {
  fetchAddonsForCustomization,
  fetchVariantsForMenuItem,
} from "@/lib/menu-item-detail-sql";
import { mapAddonsFromApiRows } from "@/lib/map-menu-item-options";

export const runtime = "nodejs";

function unwrapAttributeValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if ("value" in obj) return unwrapAttributeValue(obj.value);
    if ("raw" in obj) return unwrapAttributeValue(obj.raw);
    if ("data" in obj) return unwrapAttributeValue(obj.data);
  }
  return v;
}

function attributeValueAsNumber(v: unknown): number | null {
  const val = unwrapAttributeValue(v);
  if (val == null) return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function attributeValueAsString(v: unknown): string | null {
  const val = unwrapAttributeValue(v);
  if (val == null) return null;
  if (typeof val === "string") return val;
  return String(val);
}

function attributeValueAsBoolean(v: unknown): boolean | null {
  const val = unwrapAttributeValue(v);
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const x = val.trim().toLowerCase();
    if (x === "true") return true;
    if (x === "false") return false;
  }
  if (typeof val === "number") return val !== 0;
  return null;
}

function extractR2KeyFromProxyUrl(url: string): string {
  try {
    const fakeOrigin = "https://local.invalid";
    const u = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url)
      : new URL(url, fakeOrigin);
    const key = u.searchParams.get("key");
    return key ? decodeURIComponent(key) : "";
  } catch {
    return "";
  }
}

async function getAgentIdForStore(storeId: number): Promise<number | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;
  const systemUser = await getSystemUserByEmail(user.email);
  return systemUser?.id ?? null;
}

/** GET single item with variants, customizations (with addons), images, linked_modifier_groups */
export async function GET(
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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [item] = await sql`
      SELECT id, item_id, item_name, item_description, item_image_url, short_name, category_id,
             food_type, spice_level, cuisine_type, base_price, selling_price,
             discount_percentage, tax_percentage,
             in_stock, is_active, is_deleted, display_order,
             has_customizations, has_addons, has_variants,
             is_popular, is_recommended,
             COALESCE(preparation_time_minutes, preparation_time, 15)::integer AS preparation_time_minutes,
             packaging_charges,
             serves, serves_label, item_size_value, item_size_unit, available_for_delivery,
             allergens,
             weight_per_serving, weight_per_serving_unit, calories_kcal,
             protein, protein_unit, carbohydrates, carbohydrates_unit,
             fat, fat_unit, fibre, fibre_unit, item_tags,
             approval_status::text,
             (SELECT EXISTS(SELECT 1 FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING')) AS has_pending_change_request,
             (SELECT request_type::text FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING' ORDER BY r.created_at DESC LIMIT 1) AS pending_change_request_type
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const [variantRows, customizationsRows, imagesRows] = await Promise.all([
      fetchVariantsForMenuItem(sql, menuItemId),
      sql`
        SELECT id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order
        FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId} ORDER BY display_order ASC, id ASC
      `,
      sql`
        SELECT id, image_url, is_primary, display_order FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId} ORDER BY display_order ASC, id ASC
      `,
    ]);

    const customizations = customizationsRows as unknown as { id: number }[];
    const optionRows = await Promise.all(
      customizations.map((c) => fetchAddonsForCustomization(sql, Number(c.id)))
    );
    const customizationsWithOptions = customizations.map((c: Record<string, unknown>, i: number) => ({
      id: Number(c.id),
      customization_id: c.customization_id,
      customization_title: c.customization_title,
      customization_type: c.customization_type ?? null,
      is_required: c.is_required ?? false,
      min_selection: c.min_selection ?? 0,
      max_selection: c.max_selection ?? 1,
      display_order: c.display_order ?? 0,
      addons: mapAddonsFromApiRows(optionRows[i] ?? []),
    }));

    let linked_modifier_groups: any[] = [];
    try {
      const linkRows = await sql`
        SELECT img.id, img.modifier_group_id, img.display_order
        FROM merchant_item_modifier_groups img
        WHERE img.menu_item_id = ${menuItemId}
        ORDER BY img.display_order ASC, img.id ASC
      `;
      for (const link of linkRows as any[]) {
        const [g] = await sql`
          SELECT id, group_code, title, description, is_required, min_selection, max_selection
          FROM merchant_modifier_groups WHERE id = ${link.modifier_group_id}
        `;
        if (!g) continue;
        const opts = await sql`
          SELECT id, option_code, name, price_delta::text, in_stock, display_order
          FROM merchant_modifier_options WHERE modifier_group_id = ${link.modifier_group_id}
          ORDER BY display_order ASC, id ASC
        `;
        linked_modifier_groups.push({
          id: link.id,
          modifier_group_id: link.modifier_group_id,
          display_order: link.display_order,
          title: (g as any).title,
          description: (g as any).description,
          is_required: (g as any).is_required ?? false,
          min_selection: (g as any).min_selection ?? 0,
          max_selection: (g as any).max_selection ?? 1,
          options: (opts as any[]).map((o: any) => ({
            id: o.id,
            option_id: o.option_code ?? o.option_id,
            name: o.name,
            price_delta: o.price_delta,
            in_stock: o.in_stock ?? true,
            display_order: o.display_order ?? 0,
          })),
        });
      }
    } catch {
      linked_modifier_groups = [];
    }

    // Unified catalog attributes can be source-of-truth for nutrition/delivery fields.
    // Keep this best-effort because some environments may not have these tables yet.
    const itemAttributes = new Map<string, unknown>();
    try {
      const itemAttributeRows = await sql`
        SELECT ad.attribute_name, ia.value
        FROM item_attributes ia
        INNER JOIN attribute_definitions ad ON ad.id = ia.attribute_id
        WHERE ia.item_id = ${menuItemId}
          AND ad.applies_to IN ('ITEM', 'BOTH')
      `;
      for (const row of itemAttributeRows as unknown as Array<{ attribute_name: string; value: unknown }>) {
        if (!row?.attribute_name) continue;
        itemAttributes.set(row.attribute_name, row.value);
      }
    } catch {
      // ignore unified-attributes errors; fallback to legacy columns
    }
    const attrAvailableForDelivery = attributeValueAsBoolean(itemAttributes.get("available_for_delivery"));
    const attrWeightPerServing = attributeValueAsNumber(itemAttributes.get("weight_per_serving"));
    const attrWeightPerServingUnit = attributeValueAsString(itemAttributes.get("weight_per_serving_unit"));
    const attrCalories = attributeValueAsNumber(itemAttributes.get("calories_kcal"));
    const attrProtein = attributeValueAsNumber(itemAttributes.get("protein"));
    const attrProteinUnit = attributeValueAsString(itemAttributes.get("protein_unit"));
    const attrCarbohydrates = attributeValueAsNumber(itemAttributes.get("carbohydrates"));
    const attrCarbohydratesUnit = attributeValueAsString(itemAttributes.get("carbohydrates_unit"));
    const attrFat = attributeValueAsNumber(itemAttributes.get("fat"));
    const attrFatUnit = attributeValueAsString(itemAttributes.get("fat_unit"));
    const attrFibre = attributeValueAsNumber(itemAttributes.get("fibre"));
    const attrFibreUnit = attributeValueAsString(itemAttributes.get("fibre_unit"));
    const attrItemTags = itemAttributes.get("item_tags");

    return NextResponse.json({
      success: true,
      item: {
        ...(item as any),
        available_for_delivery:
          (item as any).available_for_delivery ?? attrAvailableForDelivery ?? true,
        weight_per_serving:
          (item as any).weight_per_serving ?? attrWeightPerServing,
        weight_per_serving_unit:
          (item as any).weight_per_serving_unit ?? attrWeightPerServingUnit ?? "grams",
        calories_kcal:
          (item as any).calories_kcal ?? attrCalories,
        protein:
          (item as any).protein ?? attrProtein,
        protein_unit:
          (item as any).protein_unit ?? attrProteinUnit ?? "mg",
        carbohydrates:
          (item as any).carbohydrates ?? attrCarbohydrates,
        carbohydrates_unit:
          (item as any).carbohydrates_unit ?? attrCarbohydratesUnit ?? "mg",
        fat:
          (item as any).fat ?? attrFat,
        fat_unit:
          (item as any).fat_unit ?? attrFatUnit ?? "mg",
        fibre:
          (item as any).fibre ?? attrFibre,
        fibre_unit:
          (item as any).fibre_unit ?? attrFibreUnit ?? "mg",
        item_tags:
          (item as any).item_tags ?? (Array.isArray(attrItemTags) ? attrItemTags : null),
        variants: (variantRows as Record<string, unknown>[]).map((v) => ({
          ...v,
          variant_price: v.variant_price,
        })),
        customizations: customizationsWithOptions,
        images: imagesRows,
        linked_modifier_groups,
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sql = getSql();
    const [existing] = await sql`
      SELECT item_name, item_description, category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, discount_percentage, tax_percentage,
             preparation_time_minutes, packaging_charges, serves, serves_label,
             short_name, display_order, item_size_value, item_size_unit, available_for_delivery,
             in_stock, is_active, is_popular, is_recommended, allergens,
             weight_per_serving, weight_per_serving_unit, calories_kcal,
             protein, protein_unit, carbohydrates, carbohydrates_unit,
             fat, fat_unit, fibre, fibre_unit, item_tags,
             has_customizations, has_addons, has_variants
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    const e = existing as any;
    const item_name = body.item_name !== undefined ? String(body.item_name).trim() : e.item_name;
    if (!item_name) return NextResponse.json({ success: false, error: "item_name required" }, { status: 400 });

    const item_description = mergeOptionalStr(body.item_description, e.item_description);
    const category_id = mergeNum(body.category_id, e.category_id);
    const food_type = mergeOptionalStr(body.food_type, e.food_type);
    const spice_level = mergeOptionalStr(body.spice_level, e.spice_level);
    const cuisine_type = mergeOptionalStr(body.cuisine_type, e.cuisine_type);
    const base_price = mergeNum(body.base_price, e.base_price);
    const selling_price = mergeNum(body.selling_price, e.selling_price);
    const discount_percentage = mergeNum(body.discount_percentage, e.discount_percentage);
    const tax_percentage = mergeNum(body.tax_percentage, e.tax_percentage);
    const preparation_time_minutes = mergeNumNullable(body.preparation_time_minutes, e.preparation_time_minutes);
    const packaging_charges = mergeNumNullable(body.packaging_charges, e.packaging_charges);
    const serves = mergeNumNullable(body.serves, e.serves);
    const serves_label = mergeOptionalStr(body.serves_label, e.serves_label);
    const short_name = mergeOptionalStr(body.short_name, e.short_name);
    const display_order = mergeNum(body.display_order, e.display_order);
    const item_size_value = mergeNumNullable(body.item_size_value, e.item_size_value);
    const item_size_unit = mergeOptionalStr(body.item_size_unit, e.item_size_unit);
    const available_for_delivery = mergeBool(body.available_for_delivery, e.available_for_delivery);
    const in_stock = mergeBool(body.in_stock, e.in_stock);
    const is_active = mergeBool(body.is_active, e.is_active);
    const is_popular = mergeBool(body.is_popular, e.is_popular);
    const is_recommended = mergeBool(body.is_recommended, e.is_recommended);
    const allergens = mergeStringArray(body.allergens, e.allergens);
    const weight_per_serving = mergeNumNullable(body.weight_per_serving, e.weight_per_serving);
    const weight_per_serving_unit = mergeOptionalStr(body.weight_per_serving_unit, e.weight_per_serving_unit);
    const calories_kcal = mergeNumNullable(body.calories_kcal, e.calories_kcal);
    const protein = mergeNumNullable(body.protein, e.protein);
    const protein_unit = mergeOptionalStr(body.protein_unit, e.protein_unit);
    const carbohydrates = mergeNumNullable(body.carbohydrates, e.carbohydrates);
    const carbohydrates_unit = mergeOptionalStr(body.carbohydrates_unit, e.carbohydrates_unit);
    const fat = mergeNumNullable(body.fat, e.fat);
    const fat_unit = mergeOptionalStr(body.fat_unit, e.fat_unit);
    const fibre = mergeNumNullable(body.fibre, e.fibre);
    const fibre_unit = mergeOptionalStr(body.fibre_unit, e.fibre_unit);
    const item_tags_arr = mergeStringArrayOrComma(body.item_tags, e.item_tags);
    const item_tags = item_tags_arr.length ? item_tags_arr : null;
    const has_customizations = mergeBool(body.has_customizations, e.has_customizations);
    const has_addons = mergeBool(body.has_addons, e.has_addons);
    const has_variants = mergeBool(body.has_variants, e.has_variants);

    await sql`
      UPDATE merchant_menu_items
      SET item_name = ${item_name},
          item_description = ${item_description},
          category_id = ${category_id},
          food_type = ${food_type},
          spice_level = ${spice_level},
          cuisine_type = ${cuisine_type},
          base_price = ${base_price},
          selling_price = ${selling_price},
          discount_percentage = ${discount_percentage},
          tax_percentage = ${tax_percentage},
          preparation_time_minutes = ${preparation_time_minutes},
          packaging_charges = ${packaging_charges},
          serves = ${serves},
          serves_label = ${serves_label},
          short_name = ${short_name},
          display_order = ${display_order},
          item_size_value = ${item_size_value},
          item_size_unit = ${item_size_unit},
          available_for_delivery = ${available_for_delivery},
          in_stock = ${in_stock},
          is_active = ${is_active},
          is_popular = ${is_popular},
          is_recommended = ${is_recommended},
          allergens = ${allergens},
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
          item_tags = ${item_tags},
          has_customizations = ${has_customizations},
          has_addons = ${has_addons},
          has_variants = ${has_variants},
          updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_items",
        fieldName: "menu_item",
        oldValue: JSON.stringify({ item_name: e.item_name, base_price: e.base_price, selling_price: e.selling_price }),
        newValue: JSON.stringify({ item_name, base_price: body.base_price !== undefined ? body.base_price : e.base_price, selling_price: body.selling_price !== undefined ? body.selling_price : e.selling_price }),
        actionType: "update",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "menu_item", action: "update", entityId: menuItemId, entityName: item_name, summary: `Agent updated menu item "${item_name}"`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const sql = getSql();
    const [item] = await sql`
      SELECT id, item_name, item_image_url
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const itemNameForLog = (item as any).item_name as string | null;
    const images = (await sql`
      SELECT id, r2_key
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId}
    `) as { id: number; r2_key: string | null }[];
    const r2Keys = new Set<string>();
    for (const image of images) {
      if (image.r2_key) r2Keys.add(image.r2_key);
    }
    const itemImageUrl = String((item as any).item_image_url ?? "");
    if (itemImageUrl) {
      const parsed = itemImageUrl.includes("/api/attachments/proxy")
        ? extractR2KeyFromProxyUrl(itemImageUrl)
        : itemImageUrl;
      if (parsed) r2Keys.add(parsed);
    }

    await sql.begin(async (trx) => {
      const run = trx as unknown as typeof sql;
      await run`
        DELETE FROM merchant_menu_item_change_requests
        WHERE menu_item_id = ${menuItemId}
      `;
      await run`
        DELETE FROM merchant_menu_item_addons
        WHERE customization_id IN (
          SELECT id FROM merchant_menu_item_customizations WHERE menu_item_id = ${menuItemId}
        )
      `;
      await run`
        DELETE FROM merchant_menu_item_customizations
        WHERE menu_item_id = ${menuItemId}
      `;
      await run`
        DELETE FROM merchant_menu_item_variants
        WHERE menu_item_id = ${menuItemId}
      `;
      await run`
        DELETE FROM merchant_item_modifier_groups
        WHERE menu_item_id = ${menuItemId}
      `;
      await run`
        DELETE FROM merchant_menu_item_images
        WHERE menu_item_id = ${menuItemId}
      `;
      await run`        DELETE FROM merchant_menu_items
        WHERE id = ${menuItemId} AND store_id = ${storeId}
      `;
    });

    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_items",
        fieldName: "menu_item",
        oldValue: JSON.stringify({ item_id: menuItemId, item_name: itemNameForLog }),
        newValue: null,
        actionType: "delete",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "menu_item", action: "delete", entityId: menuItemId, summary: `Agent deleted menu item #${menuItemId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}

    if (r2Keys.size > 0) {
      try {
        await Promise.all(
          Array.from(r2Keys)
            .map((key) => deleteDocument(key).catch(() => undefined))
        );
      } catch (e) {
        console.error("[DELETE items/[itemId]] R2 cleanup failed", e);
      }
    }

    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/items/[itemId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

