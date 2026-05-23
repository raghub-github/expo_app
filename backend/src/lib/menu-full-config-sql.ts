/** SQL loaders for customer full-config (variants/addons with size columns + migration fallback). */

import { getSql } from "../db/client.js";

function isMissingColumnError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "42703";
}

export async function fetchVariantsForFullConfig(menuItemId: number): Promise<Record<string, unknown>[]> {
  const sql = getSql();
  try {
    return (await sql`
      SELECT id, variant_id, variant_name, variant_type, variant_price::text,
             variant_size_value::text, variant_size_unit,
             is_default, display_order, in_stock
      FROM merchant_menu_item_variants
      WHERE menu_item_id = ${menuItemId} AND in_stock IS NOT FALSE
      ORDER BY display_order ASC, id ASC
    `) as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    console.warn(
      "[menu-full-config] variant_size_* columns missing — run migrations 0237/0238. Sizes will be empty in the app."
    );
    return (await sql`
      SELECT id, variant_id, variant_name, variant_type, variant_price::text,
             is_default, display_order, in_stock
      FROM merchant_menu_item_variants
      WHERE menu_item_id = ${menuItemId} AND in_stock IS NOT FALSE
      ORDER BY display_order ASC, id ASC
    `) as Record<string, unknown>[];
  }
}

export async function fetchAddonsForCustomizationIds(
  customizationIds: number[]
): Promise<Record<string, unknown>[]> {
  if (customizationIds.length === 0) return [];
  const sql = getSql();
  try {
    return (await sql`
      SELECT id, customization_id, addon_id, addon_name, addon_price::text,
             addon_image_url, addon_size_value::text, addon_size_unit,
             display_order, in_stock
      FROM merchant_menu_item_addons
      WHERE customization_id = ANY(${customizationIds}::bigint[])
        AND in_stock IS NOT FALSE
      ORDER BY customization_id ASC, display_order ASC, id ASC
    `) as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    console.warn(
      "[menu-full-config] addon_size_* columns missing — run migration 0237. Addon sizes will be empty in the app."
    );
    return (await sql`
      SELECT id, customization_id, addon_id, addon_name, addon_price::text,
             addon_image_url, display_order, in_stock
      FROM merchant_menu_item_addons
      WHERE customization_id = ANY(${customizationIds}::bigint[])
        AND in_stock IS NOT FALSE
      ORDER BY customization_id ASC, display_order ASC, id ASC
    `) as Record<string, unknown>[];
  }
}
