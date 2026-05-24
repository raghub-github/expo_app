import type { Sql } from "postgres";
import type { NormalizedOrderAddon, NormalizedOrderItem } from "../orders/orderNormalizer.js";

function isMissingMenuAddonId(id: string): boolean {
  const t = id.trim();
  return !t || t === "0" || t === "undefined" || t === "null";
}

/**
 * Fill menuAddonId / customizationId / menuAddonPk when the client sent legacy
 * addonId 0 or omitted stable menu addon ids.
 */
export async function enrichAddonsWithMenuMetadata(
  sql: Sql,
  storeId: number,
  items: NormalizedOrderItem[],
): Promise<void> {
  if (!storeId || storeId <= 0) return;

  for (const it of items) {
    for (const ad of it.addons) {
      if (!isMissingMenuAddonId(ad.menuAddonId)) continue;

      const name = ad.addonName.trim();
      if (!name) continue;

      const cust = ad.customizationId != null ? String(ad.customizationId).trim() : "";

      const rows =
        cust.length > 0
          ? await sql<
              Array<{
                id: number;
                addon_id: string;
                customization_id: string;
              }>
            >`
              SELECT a.id, a.addon_id, c.customization_id
              FROM merchant_menu_item_addons a
              INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
              INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id
              WHERE m.store_id = ${storeId}
                AND m.id = ${it.menuItemId}
                AND c.customization_id = ${cust}
                AND (
                  a.addon_name = ${name}
                  OR a.addon_name ILIKE ${`%${name}%`}
                )
              ORDER BY
                CASE WHEN a.addon_name = ${name} THEN 0 ELSE 1 END,
                a.id
              LIMIT 1
            `
          : await sql<
              Array<{
                id: number;
                addon_id: string;
                customization_id: string;
              }>
            >`
              SELECT a.id, a.addon_id, c.customization_id
              FROM merchant_menu_item_addons a
              INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
              INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id
              WHERE m.store_id = ${storeId}
                AND m.id = ${it.menuItemId}
                AND (
                  a.addon_name = ${name}
                  OR a.addon_name ILIKE ${`%${name}%`}
                )
              ORDER BY
                CASE WHEN a.addon_name = ${name} THEN 0 ELSE 1 END,
                a.id
              LIMIT 1
            `;

      const hit = rows[0];
      if (!hit?.addon_id) continue;

      ad.menuAddonId = String(hit.addon_id).trim();
      ad.menuAddonPk = Number(hit.id);
      if (!ad.customizationId && hit.customization_id) {
        ad.customizationId = String(hit.customization_id).trim();
      }
    }
  }
}
