import { getSql } from "../db/client.js";

/** Addon label lines per orders_core_items.id for list/detail customization strings. */
export async function loadOrderItemAddonLabelsByCoreItemIds(
  coreItemIds: number[],
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const ids = [...new Set(coreItemIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return out;

  try {
    const sql = getSql();
    const rows = await sql<
      Array<{
        order_item_id: number;
        addon_name: string | null;
        quantity: number | null;
      }>
    >`
      SELECT order_item_id, addon_name, quantity
      FROM orders_core_item_addons
      WHERE order_item_id = ANY(${ids})
    `;
    for (const row of rows) {
      const label = (row.addon_name ?? "").trim();
      if (!label) continue;
      const qty = row.quantity ?? 1;
      const text = qty > 1 ? `${label} x${qty}` : label;
      const list = out.get(row.order_item_id) ?? [];
      list.push(text);
      out.set(row.order_item_id, list);
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") return out;
    throw err;
  }
  return out;
}
