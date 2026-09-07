/**
 * Bulk-create categories, items, variants, and customizations from a parsed XLSX payload.
 * Field writes match POST /menu/items and the Add Item modal.
 */
import { NextRequest, NextResponse } from "next/server";
import { ulid } from "ulid";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import {
  listCuisinesForStoreDashboard,
  createCustomCuisine,
  resolveStoreTypeForMenu,
  isGroceryStoreType,
  CategoryRuleError,
  enforceStorePlanLimits,
} from "@/lib/db/operations/menu-category-rules";
import { genId } from "../assert-store-access";
import { MENU_XLSX_LIMITS, itemNameMatchKey, normKey, type MenuBulkImportPayload } from "@/lib/menu-xlsx-import";
import { collapseDuplicateMenuItems } from "@/lib/collapse-duplicate-menu-items";

export const runtime = "nodejs";

function itemJoinKey(name: string, category: string | null | undefined): string {
  return `${normKey(name)}||${normKey(category ?? "")}`;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function fillText(oldV: unknown, incoming: unknown): string | null {
  if (!isBlank(oldV)) {
    const s = String(oldV).trim();
    return s || null;
  }
  if (isBlank(incoming)) return isBlank(oldV) ? null : String(oldV);
  return String(incoming).trim() || null;
}

function fillNum(oldV: unknown, incoming: unknown): number | null {
  const oldN = oldV == null || oldV === "" ? null : Number(oldV);
  const newN = incoming == null || incoming === "" ? null : Number(incoming);
  if (oldN != null && Number.isFinite(oldN) && oldN > 0) return oldN;
  if (newN != null && Number.isFinite(newN) && newN > 0) return newN;
  if (oldN != null && Number.isFinite(oldN)) return oldN;
  if (newN != null && Number.isFinite(newN)) return newN;
  return null;
}

function fillArr(oldV: unknown, incoming: unknown): string[] | null {
  if (Array.isArray(oldV) && oldV.length > 0) return oldV.map(String);
  if (Array.isArray(incoming) && incoming.length > 0) return incoming.map(String);
  return null;
}

function replaceText(oldV: unknown, incoming: unknown): string | null {
  if (incoming == null) return fillText(oldV, null);
  const s = String(incoming).trim();
  if (s === "") return fillText(oldV, null);
  return s;
}

function replaceNum(oldV: unknown, incoming: unknown): number | null {
  const newN = incoming == null || incoming === "" ? null : Number(incoming);
  if (newN != null && Number.isFinite(newN)) return newN;
  return fillNum(oldV, null);
}

function replaceArr(oldV: unknown, incoming: unknown): string[] | null {
  if (Array.isArray(incoming) && incoming.length > 0) return incoming.map(String);
  return fillArr(oldV, incoming);
}

function pgErrorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return undefined;
}

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
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
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

    const body = (await request.json().catch(() => ({}))) as Partial<MenuBulkImportPayload>;
    const categories = asArray<MenuBulkImportPayload["categories"][number]>(body.categories);
    const items = asArray<MenuBulkImportPayload["items"][number]>(body.items);
    const variants = asArray<MenuBulkImportPayload["variants"][number]>(body.variants);
    const customizations = asArray<MenuBulkImportPayload["customizations"][number]>(body.customizations);
    const addons = asArray<MenuBulkImportPayload["addons"][number]>(body.addons);

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "No menu items to import" }, { status: 400 });
    }
    if (items.length > MENU_XLSX_LIMITS.items) {
      return NextResponse.json({ success: false, error: `Too many items (max ${MENU_XLSX_LIMITS.items})` }, { status: 400 });
    }
    if (categories.length > MENU_XLSX_LIMITS.categories) {
      return NextResponse.json({ success: false, error: `Too many categories (max ${MENU_XLSX_LIMITS.categories})` }, { status: 400 });
    }

    for (const it of items) {
      if (!String(it.item_name ?? "").trim()) {
        return NextResponse.json({ success: false, error: `Row ${it.row}: item name is required` }, { status: 400 });
      }
      if (!String(it.category_name ?? "").trim()) {
        return NextResponse.json({ success: false, error: `Row ${it.row}: category is required` }, { status: 400 });
      }
    }

    const sql = getSql();
    await collapseDuplicateMenuItems(sql, storeId);
    const storeType = await resolveStoreTypeForMenu(storeId);
    const isGrocery = isGroceryStoreType(storeType);
    const linkedCuisines = await listCuisinesForStoreDashboard(storeId);
    const cuisineByName = new Map(linkedCuisines.map((c) => [normKey(c.name), c.id]));

    const existingCats = await sql<{
      id: number;
      category_name: string;
      parent_category_id: number | null;
      cuisine_id: number | null;
      category_description: string | null;
    }[]>`
      SELECT id, category_name, parent_category_id, cuisine_id, category_description
      FROM merchant_menu_categories
      WHERE store_id = ${storeId} AND COALESCE(is_deleted, FALSE) = FALSE
    `;
    const catIdByKey = new Map<string, number>();
    const catCuisineById = new Map<number, number | null>();
    const catById = new Map<
      number,
      { id: number; category_name: string; parent_category_id: number | null }
    >();
    for (const c of existingCats) {
      catById.set(Number(c.id), c);
      catCuisineById.set(Number(c.id), c.cuisine_id != null ? Number(c.cuisine_id) : null);
    }
    for (const c of existingCats) {
      const parent = c.parent_category_id != null ? catById.get(Number(c.parent_category_id)) : null;
      catIdByKey.set(`${normKey(c.category_name)}||${normKey(parent?.category_name ?? "")}`, Number(c.id));
      if (!catIdByKey.has(`${normKey(c.category_name)}||`)) {
        catIdByKey.set(`${normKey(c.category_name)}||`, Number(c.id));
      }
    }

    const toCreate = categories.filter((c) => {
      const name = String(c.category_name ?? "").trim();
      if (!name) return false;
      const key = `${normKey(name)}||${normKey(c.parent_category_name ?? "")}`;
      return !catIdByKey.has(key) && !catIdByKey.has(`${normKey(name)}||`);
    });
    const uniqueCreate = new Map<string, (typeof categories)[number]>();
    for (const c of toCreate) {
      uniqueCreate.set(`${normKey(c.category_name)}||${normKey(c.parent_category_name ?? "")}`, c);
    }

    // XLSX cuisines (e.g. Mughlai) often exist in cuisine_master but are not yet
    // on merchant_store_cuisines. Link them the same way Add Cuisine does so
    // import is not blocked, then keep using the resolved ids below.
    const cuisineNames = new Set<string>();
    for (const cat of categories) {
      const n = String(cat.cuisine ?? "").trim();
      if (n) cuisineNames.add(n);
    }
    for (const cat of uniqueCreate.values()) {
      const n = String(cat.cuisine ?? "").trim();
      if (n) cuisineNames.add(n);
    }
    const parentId = Number(store.parent_id);
    for (const cuisineName of cuisineNames) {
      if (cuisineByName.has(normKey(cuisineName))) continue;
      const linked = await createCustomCuisine({
        parentId: Number.isFinite(parentId) && parentId > 0 ? parentId : storeId,
        storeIdNum: storeId,
        name: cuisineName,
      });
      cuisineByName.set(normKey(cuisineName), linked.id);
    }

    const existingItemRows = await sql<{
      id: number;
      item_name: string;
      category_id: number | null;
      category_name: string | null;
      item_description: string | null;
      food_type: string | null;
      spice_level: string | null;
      cuisine_type: string | null;
      allergens: string[] | null;
      item_tags: string[] | null;
      base_price: string | number | null;
      selling_price: string | number | null;
      preparation_time_minutes: number | null;
      packaging_charges: string | number | null;
      serves: number | null;
      serves_label: string | null;
      item_size_value: string | number | null;
      item_size_unit: string | null;
      available_quantity: number | null;
      low_stock_threshold: number | null;
      expiry_date: string | null;
      weight_per_serving: string | number | null;
      calories_kcal: number | null;
      protein: string | number | null;
      carbohydrates: string | number | null;
      fat: string | number | null;
      fibre: string | number | null;
    }[]>`
      SELECT i.id, i.item_name, i.category_id, c.category_name,
        i.item_description, i.food_type, i.spice_level, i.cuisine_type,
        i.allergens, i.item_tags, i.base_price, i.selling_price,
        i.preparation_time_minutes, i.packaging_charges, i.serves, i.serves_label,
        i.item_size_value, i.item_size_unit, i.available_quantity, i.low_stock_threshold,
        i.expiry_date::text AS expiry_date,
        i.weight_per_serving, i.calories_kcal, i.protein, i.carbohydrates, i.fat, i.fibre
      FROM merchant_menu_items i
      LEFT JOIN merchant_menu_categories c ON c.id = i.category_id
      WHERE i.store_id = ${storeId} AND COALESCE(i.is_deleted, FALSE) = FALSE
      ORDER BY i.id ASC
    `;
    const existingItemByKey = new Map<string, (typeof existingItemRows)[number]>();
    for (const row of existingItemRows) {
      existingItemByKey.set(itemJoinKey(row.item_name, row.category_name), row);
      if (!existingItemByKey.has(`${normKey(row.item_name)}||`)) {
        existingItemByKey.set(`${normKey(row.item_name)}||`, row);
      }
      const mk = itemNameMatchKey(String(row.item_name ?? ""));
      if (mk && !existingItemByKey.has(`mk:${mk}`)) {
        existingItemByKey.set(`mk:${mk}`, row);
      }
    }

    const existingVariantNames = new Set<string>();
    const existingVariantRows = await sql<{ menu_item_id: number; variant_name: string }[]>`
      SELECT v.menu_item_id, v.variant_name
      FROM merchant_menu_item_variants v
      INNER JOIN merchant_menu_items i ON i.id = v.menu_item_id
      WHERE i.store_id = ${storeId}
    `;
    for (const v of existingVariantRows) {
      existingVariantNames.add(`${Number(v.menu_item_id)}||${normKey(v.variant_name)}`);
    }

    const existingGroupRows = await sql<{ id: number; menu_item_id: number; customization_title: string }[]>`
      SELECT c.id, c.menu_item_id, c.customization_title
      FROM merchant_menu_item_customizations c
      INNER JOIN merchant_menu_items i ON i.id = c.menu_item_id
      WHERE i.store_id = ${storeId}
    `;
    const existingGroupByKey = new Map<string, number>();
    for (const g of existingGroupRows) {
      existingGroupByKey.set(`${Number(g.menu_item_id)}||${normKey(g.customization_title)}`, Number(g.id));
    }

    const existingAddonNames = new Set<string>();
    const existingAddonRows = await sql<{ customization_id: number; addon_name: string }[]>`
      SELECT a.customization_id, a.addon_name
      FROM merchant_menu_item_addons a
      INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
      INNER JOIN merchant_menu_items i ON i.id = c.menu_item_id
      WHERE i.store_id = ${storeId}
    `;
    for (const a of existingAddonRows) {
      existingAddonNames.add(`${Number(a.customization_id)}||${normKey(a.addon_name)}`);
    }

    for (const it of items) {
      const name = String(it.item_name ?? "").trim();
      const cat = String(it.category_name ?? "").trim();
      const exists =
        existingItemByKey.has(itemJoinKey(name, cat)) ||
        existingItemByKey.has(`${normKey(name)}||`) ||
        existingItemByKey.has(`mk:${itemNameMatchKey(name)}`);
      if (exists) continue;
      if (!Number.isFinite(Number(it.base_price)) || Number(it.base_price) <= 0) {
        return NextResponse.json({ success: false, error: `Row ${it.row}: valid base price required` }, { status: 400 });
      }
    }

    const created = await sql.begin(async (tx) => {
      const parentsFirst = [...uniqueCreate.values()].sort((a, b) => {
        const ap = String(a.parent_category_name ?? "").trim();
        const bp = String(b.parent_category_name ?? "").trim();
        if (!ap && bp) return -1;
        if (ap && !bp) return 1;
        return 0;
      });

      for (const cat of parentsFirst) {
        const name = String(cat.category_name).trim();
        const parentName = String(cat.parent_category_name ?? "").trim();
        const parentId = parentName ? catIdByKey.get(`${normKey(parentName)}||`) ?? null : null;
        if (parentName && parentId == null) {
          throw new Error(`Parent category "${parentName}" was not found for "${name}"`);
        }
        if (parentId != null) {
          const parentRow = catById.get(parentId);
          if (parentRow?.parent_category_id != null) {
            throw new Error("Subcategories can only be created under a top-level category");
          }
        }
        const cuisineName = String(cat.cuisine ?? "").trim();
        let cuisine_id = cuisineName ? cuisineByName.get(normKey(cuisineName)) ?? null : null;
        if (cuisineName && cuisine_id == null) {
          throw new Error(`Cuisine "${cuisineName}" is not linked to this store`);
        }
        if (parentId != null && cuisine_id == null) {
          cuisine_id = catCuisineById.get(parentId) ?? null;
        }
        let row: { id: number } | undefined;
        try {
          [row] = await tx<{ id: number }[]>`
          INSERT INTO merchant_menu_categories (
            store_id, category_name, category_description, category_image_url,
            parent_category_id, cuisine_id, display_order, is_active, is_deleted, created_at, updated_at
          )
          VALUES (
            ${storeId},
            ${name},
            ${cat.category_description ?? null},
            ${null},
            ${parentId},
            ${cuisine_id},
            ${Number(cat.display_order) || 0},
            ${cat.is_active !== false},
            FALSE,
            NOW(),
            NOW()
          )
          RETURNING id
        `;
        } catch (ins: unknown) {
          if ((ins as { code?: string })?.code === "23505") {
            throw new Error(`A category named "${name}" already exists`);
          }
          throw ins;
        }
        const newId = Number(row?.id);
        if (!Number.isFinite(newId)) throw new Error(`Failed to create category "${name}"`);
        catIdByKey.set(`${normKey(name)}||${normKey(parentName)}`, newId);
        if (!catIdByKey.has(`${normKey(name)}||`)) catIdByKey.set(`${normKey(name)}||`, newId);
        catCuisineById.set(newId, cuisine_id);
        catById.set(newId, { id: newId, category_name: name, parent_category_id: parentId });
      }

      let categoriesFilled = 0;
      for (const cat of categories) {
        const name = String(cat.category_name ?? "").trim();
        if (!name) continue;
        const parentName = String(cat.parent_category_name ?? "").trim();
        const existingId =
          catIdByKey.get(`${normKey(name)}||${normKey(parentName)}`) ??
          catIdByKey.get(`${normKey(name)}||`) ??
          null;
        if (!existingId) continue;
        const old = existingCats.find((c) => Number(c.id) === existingId);
        if (!old) continue;
        const nextDesc = fillText(old.category_description, cat.category_description);
        const cuisineName = String(cat.cuisine ?? "").trim();
        const incomingCuisine = cuisineName ? cuisineByName.get(normKey(cuisineName)) ?? null : null;
        const nextCuisine = old.cuisine_id != null ? Number(old.cuisine_id) : incomingCuisine;
        const descChanged = fillText(old.category_description, null) !== nextDesc;
        const cuisineChanged = (old.cuisine_id != null ? Number(old.cuisine_id) : null) !== nextCuisine;
        if (!descChanged && !cuisineChanged) continue;
        await tx`
          UPDATE merchant_menu_categories
          SET category_description = ${nextDesc},
              cuisine_id = ${nextCuisine},
              updated_at = NOW()
          WHERE id = ${existingId} AND store_id = ${storeId}
        `;
        categoriesFilled += 1;
      }

      const itemIdByKey = new Map<string, number>();
      for (const row of existingItemRows) {
        const pk = Number(row.id);
        itemIdByKey.set(itemJoinKey(row.item_name, row.category_name), pk);
        if (!itemIdByKey.has(`${normKey(row.item_name)}||`)) {
          itemIdByKey.set(`${normKey(row.item_name)}||`, pk);
        }
        const mk = itemNameMatchKey(String(row.item_name ?? ""));
        if (mk && !itemIdByKey.has(`mk:${mk}`)) {
          itemIdByKey.set(`mk:${mk}`, pk);
        }
      }
      let itemsCreated = 0;
      let itemsFilled = 0;

      for (const it of items) {
        const item_name = String(it.item_name).trim();
        const category_name = String(it.category_name).trim();
        const joinKey = itemJoinKey(item_name, category_name);
        const nameKey = `${normKey(item_name)}||`;
        const matchKey = `mk:${itemNameMatchKey(item_name)}`;
        const category_id =
          catIdByKey.get(`${normKey(category_name)}||`) ??
          catIdByKey.get(itemJoinKey(category_name, null));
        if (!category_id) throw new Error(`Category "${category_name}" was not found for item "${item_name}"`);

        const existingItem =
          existingItemByKey.get(joinKey) ??
          existingItemByKey.get(nameKey) ??
          existingItemByKey.get(matchKey) ??
          null;
        const alreadyPk = itemIdByKey.get(joinKey) ?? itemIdByKey.get(nameKey) ?? itemIdByKey.get(matchKey) ?? null;
        if (existingItem) {
          const pk = Number(existingItem.id);
          const extraIds = existingItemRows
            .filter(
              (row) =>
                Number(row.id) !== pk &&
                itemNameMatchKey(String(row.item_name ?? "")) === itemNameMatchKey(item_name)
            )
            .map((row) => Number(row.id));
          if (extraIds.length > 0) {
            await tx`
              UPDATE merchant_menu_items
              SET is_deleted = TRUE, is_active = FALSE, updated_at = NOW()
              WHERE store_id = ${storeId} AND id IN ${tx(extraIds)}
            `;
          }
          const mergedDesc = replaceText(existingItem.item_description, it.item_description);
          const mergedFood = isGrocery ? existingItem.food_type : replaceText(existingItem.food_type, it.food_type);
          const mergedSpice = isGrocery ? existingItem.spice_level : replaceText(existingItem.spice_level, it.spice_level);
          const mergedCuisine = isGrocery
            ? existingItem.cuisine_type
            : replaceText(existingItem.cuisine_type, it.cuisine_type);
          const mergedAllergens = isGrocery
            ? existingItem.allergens
            : replaceArr(existingItem.allergens, it.allergens);
          const mergedTags = isGrocery ? existingItem.item_tags : replaceArr(existingItem.item_tags, it.item_tags);
          const mergedBase = replaceNum(existingItem.base_price, it.base_price) ?? Number(it.base_price);
          const mergedSell =
            replaceNum(existingItem.selling_price, it.selling_price) ??
            replaceNum(existingItem.selling_price, it.base_price) ??
            mergedBase;
          const mergedPrep = replaceNum(existingItem.preparation_time_minutes, it.preparation_time_minutes);
          const mergedPack = isGrocery
            ? existingItem.packaging_charges
            : replaceNum(existingItem.packaging_charges, it.packaging_charges);
          const mergedServes = isGrocery ? existingItem.serves : replaceNum(existingItem.serves, it.serves);
          const mergedServesLabel = isGrocery
            ? existingItem.serves_label
            : replaceText(existingItem.serves_label, it.serves_label);
          const mergedSize = replaceNum(existingItem.item_size_value, it.item_size_value);
          const mergedSizeUnit = replaceText(existingItem.item_size_unit, it.item_size_unit);
          const mergedQty = replaceNum(existingItem.available_quantity, it.available_quantity);
          const mergedLow = replaceNum(existingItem.low_stock_threshold, it.low_stock_threshold);
          const incomingExpiry =
            isGrocery && it.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(String(it.expiry_date))
              ? String(it.expiry_date)
              : null;
          const mergedExpiry = replaceText(existingItem.expiry_date, incomingExpiry);
          const mergedWeight = replaceNum(existingItem.weight_per_serving, it.weight_per_serving);
          const mergedCal = replaceNum(existingItem.calories_kcal, it.calories_kcal);
          const mergedProtein = replaceNum(existingItem.protein, it.protein);
          const mergedCarbs = replaceNum(existingItem.carbohydrates, it.carbohydrates);
          const mergedFat = replaceNum(existingItem.fat, it.fat);
          const mergedFibre = replaceNum(existingItem.fibre, it.fibre);
          await tx`
            UPDATE merchant_menu_items SET
              item_name = ${item_name},
              category_id = ${category_id},
              item_description = ${mergedDesc},
              food_type = ${mergedFood},
              spice_level = ${mergedSpice},
              cuisine_type = ${mergedCuisine},
              allergens = ${mergedAllergens},
              item_tags = ${mergedTags},
              base_price = ${mergedBase},
              selling_price = ${mergedSell},
              preparation_time_minutes = ${mergedPrep},
              packaging_charges = ${mergedPack},
              serves = ${mergedServes},
              serves_label = ${mergedServesLabel},
              item_size_value = ${mergedSize},
              item_size_unit = ${mergedSizeUnit},
              available_quantity = ${mergedQty},
              low_stock_threshold = ${mergedLow},
              expiry_date = ${mergedExpiry},
              weight_per_serving = ${mergedWeight},
              calories_kcal = ${mergedCal},
              protein = ${mergedProtein},
              carbohydrates = ${mergedCarbs},
              fat = ${mergedFat},
              fibre = ${mergedFibre},
              in_stock = ${it.in_stock !== false},
              is_active = ${it.is_active !== false},
              is_popular = ${Boolean(it.is_popular)},
              is_recommended = ${Boolean(it.is_recommended)},
              updated_at = NOW()
            WHERE id = ${pk} AND store_id = ${storeId}
          `;
          itemIdByKey.set(joinKey, pk);
          itemIdByKey.set(nameKey, pk);
          itemIdByKey.set(matchKey, pk);
          itemsFilled += 1;
          continue;
        }

        if (alreadyPk) {
          itemIdByKey.set(joinKey, alreadyPk);
          itemIdByKey.set(matchKey, alreadyPk);
          continue;
        }

        const base_price = Number(it.base_price);
        const selling_price = Number.isFinite(Number(it.selling_price)) ? Number(it.selling_price) : base_price;
        const itemId = ulid();
        const allergens = isGrocery ? null : Array.isArray(it.allergens) ? it.allergens : null;
        const item_tags = isGrocery ? null : Array.isArray(it.item_tags) ? it.item_tags : null;
        const expiryRaw = isGrocery && it.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(String(it.expiry_date)) ? String(it.expiry_date) : null;
        const has_variants = variants.some(
          (v) => normKey(v.item_name) === normKey(item_name) && (!v.category_name || normKey(v.category_name) === normKey(category_name))
        );
        const itemCusts = customizations.filter(
          (c) =>
            normKey(c.item_name) === normKey(item_name) &&
            (!c.category_name || normKey(c.category_name) === normKey(category_name))
        );
        const has_customizations = itemCusts.length > 0;
        const has_addons = addons.some(
          (a) =>
            normKey(a.item_name) === normKey(item_name) &&
            (!a.category_name || normKey(a.category_name) === normKey(category_name))
        );

        let row: { id: number } | undefined;
        try {
          [row] = await tx<{ id: number }[]>`
          INSERT INTO merchant_menu_items (
            store_id, category_id, item_id, item_name, item_description, food_type, spice_level, cuisine_type,
            base_price, selling_price, preparation_time_minutes, packaging_charges, serves, serves_label, short_name, display_order,
            item_size_value, item_size_unit, available_for_delivery,
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
            ${storeId}, ${category_id}, ${itemId}, ${item_name}, ${it.item_description ?? null},
            ${isGrocery ? null : it.food_type ?? null}, ${isGrocery ? null : it.spice_level ?? null}, ${isGrocery ? null : it.cuisine_type ?? null},
            ${base_price}, ${selling_price},
            ${it.preparation_time_minutes ?? null},
            ${isGrocery ? null : it.packaging_charges ?? null},
            ${isGrocery ? null : it.serves ?? null},
            ${isGrocery ? null : it.serves_label ?? null},
            ${null},
            ${0},
            ${it.item_size_value ?? null},
            ${it.item_size_unit ?? null},
            ${it.available_for_delivery !== false},
            ${allergens},
            ${item_tags},
            ${it.weight_per_serving ?? null},
            ${it.weight_per_serving_unit || "grams"},
            ${it.calories_kcal ?? null},
            ${it.protein ?? null},
            ${it.protein_unit || "mg"},
            ${it.carbohydrates ?? null},
            ${it.carbohydrates_unit || "mg"},
            ${it.fat ?? null},
            ${it.fat_unit || "mg"},
            ${it.fibre ?? null},
            ${it.fibre_unit || "mg"},
            ${it.in_stock !== false},
            ${it.available_quantity ?? null},
            ${it.low_stock_threshold ?? null},
            ${expiryRaw},
            ${it.is_active !== false},
            ${Boolean(it.is_popular)},
            ${Boolean(it.is_recommended)},
            ${has_customizations}, ${has_addons}, ${has_variants},
            'APPROVED'::merchant_menu_item_approval_status,
            NOW(),
            ${user.email ?? null},
            NOW(),
            NOW()
          )
          RETURNING id
        `;
        } catch (ins: unknown) {
          if (pgErrorCode(ins) !== "23505") throw ins;
          throw new Error(`Item "${item_name}" already exists in this store`);
        }
        const newId = Number(row?.id);
        if (!Number.isFinite(newId)) throw new Error(`Failed to create item "${item_name}"`);
        itemIdByKey.set(joinKey, newId);
        itemIdByKey.set(nameKey, newId);
        itemIdByKey.set(matchKey, newId);
        itemsCreated += 1;
      }

      const resolveItemPk = (item_name: string, category_name: string | null | undefined): number => {
        const exact = itemIdByKey.get(itemJoinKey(item_name, category_name));
        if (exact) return exact;
        const loose = itemIdByKey.get(`${normKey(item_name)}||`);
        if (loose) return loose;
        const stemmed = itemIdByKey.get(`mk:${itemNameMatchKey(item_name)}`);
        if (stemmed) return stemmed;
        throw new Error(`Item "${item_name}" was not created`);
      };

      let variantsCreated = 0;
      for (const v of variants) {
        const menuItemId = resolveItemPk(v.item_name, v.category_name);
        const variant_name = String(v.variant_name ?? "").trim();
        if (!variant_name) throw new Error(`Variant name is required for item "${v.item_name}"`);
        const vkey = `${menuItemId}||${normKey(variant_name)}`;
        if (existingVariantNames.has(vkey)) continue;
        const variant_price = Number(v.variant_price);
        if (!Number.isFinite(variant_price) || variant_price < 0) {
          throw new Error(`Valid variant price required for "${variant_name}"`);
        }
        const variantId = genId("VAR_");
        await tx`
          INSERT INTO merchant_menu_item_variants (
            menu_item_id, variant_id, variant_name, variant_type, variant_price,
            variant_size_value, variant_size_unit, is_default, display_order
          )
          VALUES (
            ${menuItemId}, ${variantId}, ${variant_name}, ${v.variant_type ?? null}, ${variant_price},
            ${v.variant_size_value ?? null}, ${v.variant_size_unit ?? null}, ${Boolean(v.is_default)}, ${Number(v.display_order) || 0}
          )
        `;
        existingVariantNames.add(vkey);
        variantsCreated += 1;
      }

      const groupIdByKey = new Map<string, number>(existingGroupByKey);
      let customizationsCreated = 0;
      for (const c of customizations) {
        const menuItemId = resolveItemPk(c.item_name, c.category_name);
        const customization_title = String(c.customization_title ?? "").trim();
        if (!customization_title) throw new Error(`Customization title is required for item "${c.item_name}"`);
        const gkey = `${menuItemId}||${normKey(customization_title)}`;
        if (groupIdByKey.has(gkey)) continue;
        const customizationId = genId("CUST_");
        const [row] = await tx<{ id: number }[]>`
          INSERT INTO merchant_menu_item_customizations (
            menu_item_id, customization_id, customization_title, customization_type,
            is_required, min_selection, max_selection, display_order
          )
          VALUES (
            ${menuItemId}, ${customizationId}, ${customization_title}, ${c.customization_type ?? "Checkbox"},
            ${Boolean(c.is_required)}, ${Number(c.min_selection) || 0}, ${Number(c.max_selection) >= 1 ? Number(c.max_selection) : 1}, ${Number(c.display_order) || 0}
          )
          RETURNING id
        `;
        const gid = Number(row?.id);
        if (!Number.isFinite(gid)) throw new Error(`Failed to create customization "${customization_title}"`);
        groupIdByKey.set(gkey, gid);
        customizationsCreated += 1;
      }

      let addonsCreated = 0;
      for (const a of addons) {
        const menuItemId = resolveItemPk(a.item_name, a.category_name);
        const title = String(a.customization_title ?? "").trim();
        const addon_name = String(a.addon_name ?? "").trim();
        if (!addon_name) throw new Error(`Option name is required for item "${a.item_name}"`);
        const groupId = groupIdByKey.get(`${menuItemId}||${normKey(title)}`);
        if (!groupId) throw new Error(`Customization "${title}" was not found for option "${addon_name}"`);
        const akey = `${groupId}||${normKey(addon_name)}`;
        if (existingAddonNames.has(akey)) continue;
        const addonId = genId("ADN_");
        await tx`
          INSERT INTO merchant_menu_item_addons (
            customization_id, addon_id, addon_name, addon_price,
            addon_image_url, addon_size_value, addon_size_unit, in_stock, display_order
          )
          VALUES (
            ${groupId}, ${addonId}, ${addon_name}, ${Number(a.addon_price) || 0},
            ${null}, ${a.addon_size_value ?? null}, ${a.addon_size_unit ?? null}, ${a.in_stock !== false}, ${Number(a.display_order) || 0}
          )
        `;
        existingAddonNames.add(akey);
        addonsCreated += 1;
      }

      const touchedItemIds = [...new Set(itemIdByKey.values())];
      for (const pk of touchedItemIds) {
        await tx`
          UPDATE merchant_menu_items SET
            has_variants = EXISTS (SELECT 1 FROM merchant_menu_item_variants WHERE menu_item_id = ${pk}),
            has_customizations = EXISTS (SELECT 1 FROM merchant_menu_item_customizations WHERE menu_item_id = ${pk}),
            has_addons = EXISTS (
              SELECT 1 FROM merchant_menu_item_addons a
              INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
              WHERE c.menu_item_id = ${pk}
            ),
            updated_at = NOW()
          WHERE id = ${pk} AND store_id = ${storeId}
        `;
      }

      return {
        categories: parentsFirst.length,
        categoriesFilled,
        items: itemsCreated,
        itemsFilled,
        variants: variantsCreated,
        customizations: customizationsCreated,
        addons: addonsCreated,
      };
    });

    try {
      await logStoreActivity({
        storeId,
        section: "menu_item",
        action: "create",
        summary: `Excel menu import: added ${created.items}, filled missing on ${created.itemsFilled}`,
        actorType: "agent",
        source: "dashboard",
      });
    } catch (_) {}
    try {
      await logActionByAuth(user.id, user.email, "MERCHANT", "CREATE", {
        resourceType: "MENU_ITEM",
        resourceId: String(storeId),
        actionDetails: { storeId, bulk_xlsx: true, created },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      });
    } catch (_) {}

    await enforceStorePlanLimits(storeId);

    return NextResponse.json({ success: true, created }, { status: 201 });
  } catch (e) {
    if (e instanceof CategoryRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.httpStatus ?? 400 });
    }
    if (pgErrorCode(e) === "23505") {
      return NextResponse.json(
        {
          success: false,
          error: "An item with this name already exists in this store. Duplicate names were skipped.",
        },
        { status: 400 }
      );
    }
    const msg = e instanceof Error ? e.message : "Internal error";
    if (
      msg.includes("required") ||
      msg.includes("not found") ||
      msg.includes("not linked") ||
      msg.includes("Cuisine") ||
      msg.includes("limit") ||
      msg.includes("price") ||
      msg.includes("exceed") ||
      msg.includes("already exists") ||
      msg.includes("Parent category") ||
      msg.includes("Subcategories")
    ) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    console.error("[POST /api/merchant/stores/[id]/menu/bulk-import]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
