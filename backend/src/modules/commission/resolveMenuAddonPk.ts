import type { Sql } from "postgres";

/**
 * Resolve merchant_menu_item_addons.id from stable menu addon_id + customization group id.
 */
export async function resolveMenuAddonPk(
  sql: Sql,
  storeId: number,
  menuAddonId: string,
  customizationId: string | null,
): Promise<number | null> {
  const addonText = String(menuAddonId ?? "").trim();
  if (!storeId || storeId <= 0 || !addonText) return null;

  const custText = customizationId != null ? String(customizationId).trim() : "";

  const rows =
    custText.length > 0
      ? await sql<{ id: number }[]>`
          SELECT a.id
          FROM merchant_menu_item_addons a
          INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
          INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id
          WHERE m.store_id = ${storeId}
            AND a.addon_id = ${addonText}
            AND c.customization_id = ${custText}
          LIMIT 1
        `
      : await sql<{ id: number }[]>`
          SELECT a.id
          FROM merchant_menu_item_addons a
          INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
          INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id
          WHERE m.store_id = ${storeId}
            AND a.addon_id = ${addonText}
          LIMIT 1
        `;

  const id = rows[0]?.id;
  return id != null && Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : null;
}
