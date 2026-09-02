/** merchant_menu_items PK or catalog item_id string from an order line. */
export function resolveLineItemMenuPk(item: {
  menuItemId?: number | string | null;
  menu_item_id?: number | string | null;
  /** Canonical field on orders_core.items / orders_food.items JSON payloads. */
  item_id?: number | string | null;
}): number | string | null {
  const raw = item.menuItemId ?? item.menu_item_id ?? item.item_id ?? null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const s = String(raw).trim();
  return s ? s : null;
}
