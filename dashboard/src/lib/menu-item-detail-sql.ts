function isMissingColumnError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "42703";
}

/**
 * postgres-js's Sql type has private members (e.g. Helper.then) that don't
 * structurally match a generic callable. Import the real type so the helpers
 * accept whatever the dashboard's getDb()/getSql() returns without casts at
 * every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type
type SqlClient = import("postgres").Sql<{}>;

export async function fetchAddonsForCustomization(
  sql: SqlClient,
  customizationId: number
): Promise<Record<string, unknown>[]> {
  try {
    return (await sql`
      SELECT id, addon_id, addon_name, addon_price::text, addon_image_url,
             addon_size_value::text, addon_size_unit, display_order, in_stock
      FROM merchant_menu_item_addons
      WHERE customization_id = ${customizationId}
      ORDER BY display_order ASC, id ASC
    `) as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    return (await sql`
      SELECT id, addon_id, addon_name, addon_price::text, addon_image_url,
             display_order, in_stock
      FROM merchant_menu_item_addons
      WHERE customization_id = ${customizationId}
      ORDER BY display_order ASC, id ASC
    `) as Record<string, unknown>[];
  }
}

/** Variants for many menu items (menu list hydration). */
export async function fetchVariantsForMenuItems(
  sql: SqlClient,
  menuItemIds: number[]
): Promise<Record<string, unknown>[]> {
  if (menuItemIds.length === 0) return [];
  try {
    return (await sql`
      SELECT menu_item_id, id, variant_id, variant_name, variant_type, variant_price::text,
             variant_size_value::text, variant_size_unit,
             is_default, display_order, in_stock
      FROM merchant_menu_item_variants
      WHERE menu_item_id = ANY(${menuItemIds}::bigint[])
      ORDER BY menu_item_id ASC, display_order ASC, id ASC
    `) as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    return (await sql`
      SELECT menu_item_id, id, variant_id, variant_name, variant_type, variant_price::text,
             is_default, display_order, in_stock
      FROM merchant_menu_item_variants
      WHERE menu_item_id = ANY(${menuItemIds}::bigint[])
      ORDER BY menu_item_id ASC, display_order ASC, id ASC
    `) as Record<string, unknown>[];
  }
}

export async function fetchVariantsForMenuItem(
  sql: SqlClient,
  menuItemId: number
): Promise<Record<string, unknown>[]> {
  try {
    return (await sql`
      SELECT id, variant_id, variant_name, variant_type, variant_price::text,
             variant_size_value::text, variant_size_unit,
             is_default, display_order, in_stock
      FROM merchant_menu_item_variants
      WHERE menu_item_id = ${menuItemId}
      ORDER BY display_order ASC, id ASC
    `) as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    return (await sql`
      SELECT id, variant_id, variant_name, variant_type, variant_price::text,
             is_default, display_order, in_stock
      FROM merchant_menu_item_variants
      WHERE menu_item_id = ${menuItemId}
      ORDER BY display_order ASC, id ASC
    `) as Record<string, unknown>[];
  }
}

/** Customization groups + addons for many menu items (menu list hydration). */
export async function fetchCustomizationsForMenuItems(
  sql: SqlClient,
  menuItemIds: number[]
): Promise<Record<string, unknown>[]> {
  if (menuItemIds.length === 0) return [];

  const customizationRows = (await sql`
    SELECT id, menu_item_id, customization_id, customization_title, customization_type,
           is_required, min_selection, max_selection, display_order
    FROM merchant_menu_item_customizations
    WHERE menu_item_id = ANY(${menuItemIds}::bigint[])
    ORDER BY menu_item_id ASC, display_order ASC, id ASC
  `) as Record<string, unknown>[];

  const customizationIds = customizationRows
    .map((c) => Number(c.id))
    .filter((id) => Number.isFinite(id));
  if (customizationIds.length === 0) return [];

  let flatAddons: Record<string, unknown>[];
  try {
    flatAddons = (await sql`
      SELECT customization_id, id, addon_id, addon_name, addon_price::text, addon_image_url,
             addon_size_value::text, addon_size_unit, display_order, in_stock
      FROM merchant_menu_item_addons
      WHERE customization_id = ANY(${customizationIds}::bigint[])
      ORDER BY customization_id ASC, display_order ASC, id ASC
    `) as Record<string, unknown>[];
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    flatAddons = (await sql`
      SELECT customization_id, id, addon_id, addon_name, addon_price::text, addon_image_url,
             display_order, in_stock
      FROM merchant_menu_item_addons
      WHERE customization_id = ANY(${customizationIds}::bigint[])
      ORDER BY customization_id ASC, display_order ASC, id ASC
    `) as Record<string, unknown>[];
  }
  const addonsByCustomizationId = new Map<number, Record<string, unknown>[]>();
  for (const o of flatAddons) {
    const cid = Number(o.customization_id);
    if (!Number.isFinite(cid)) continue;
    const list = addonsByCustomizationId.get(cid) ?? [];
    list.push(o);
    addonsByCustomizationId.set(cid, list);
  }

  return customizationRows.map((c) => {
    const cid = Number(c.id);
    const addons = (addonsByCustomizationId.get(cid) ?? []).map((o) => ({
      id: Number(o.id),
      addon_id: o.addon_id,
      addon_name: o.addon_name,
      addon_price: o.addon_price,
      addon_image_url: o.addon_image_url ?? null,
      addon_size_value:
        o.addon_size_value != null && o.addon_size_value !== ""
          ? Number(o.addon_size_value)
          : null,
      addon_size_unit: o.addon_size_unit ?? null,
      display_order: o.display_order ?? 0,
      in_stock: o.in_stock ?? true,
    }));
    return {
      ...c,
      menu_item_id: Number(c.menu_item_id),
      addons,
    };
  });
}
