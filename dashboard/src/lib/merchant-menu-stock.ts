import type { MenuCategory, MenuItem } from "@/app/dashboard/merchants/stores/[id]/menu/menu-types";

export type MenuOosChoice = "HOURS" | "NEXT_OPEN" | "CUSTOM" | "MANUAL";

export type MenuOosModal =
  | { kind: "item"; item_id: string; item_name: string }
  | { kind: "category"; categoryId: number; categoryName: string }
  | { kind: "combo"; comboId: number; comboName: string };

export function isOosActive(manual?: boolean, until?: string | null, nowMs = Date.now()): boolean {
  if (manual) return true;
  if (!until) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && ms > nowMs;
}

export function formatOosUntil(untilIso: string): string | null {
  const d = new Date(untilIso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${time}, ${date}`;
}

export function itemInStockIgnoringCategory(
  item: Pick<MenuItem, "in_stock" | "out_of_stock_manual" | "out_of_stock_until" | "out_of_stock_updated_at">,
  nowMs = Date.now()
): boolean {
  if (isOosActive(item.out_of_stock_manual, item.out_of_stock_until ?? null, nowMs)) {
    return false;
  }
  // Legacy in_stock=false only applies when the item was never touched by the OOS system.
  if (
    !item.out_of_stock_manual &&
    item.out_of_stock_until == null &&
    item.in_stock === false &&
    (item.out_of_stock_updated_at == null || String(item.out_of_stock_updated_at).trim() === "")
  ) {
    return false;
  }
  return true;
}

export function isItemBlockedByCategoryOos(
  item: Pick<MenuItem, "category_id" | "out_of_stock_updated_at">,
  category: Pick<MenuCategory, "out_of_stock_manual" | "out_of_stock_until" | "out_of_stock_updated_at"> | undefined,
  nowMs = Date.now()
): boolean {
  const categoryId = item.category_id ?? null;
  if (categoryId == null || !category) return false;
  const catOos = isOosActive(category.out_of_stock_manual, category.out_of_stock_until ?? null, nowMs);
  if (!catOos) return false;
  const catMarker = category.out_of_stock_updated_at ?? null;
  const itemMarker = item.out_of_stock_updated_at ?? null;
  if (!catMarker || !itemMarker) return false;
  return String(itemMarker) === String(catMarker);
}

export function effectiveInStock(
  item: MenuItem,
  categoryById: Map<number, MenuCategory>,
  nowMs = Date.now()
): boolean {
  if (!itemInStockIgnoringCategory(item, nowMs)) return false;
  const cat = item.category_id != null ? categoryById.get(item.category_id) : undefined;
  return !isItemBlockedByCategoryOos(item, cat, nowMs);
}

export function getItemOosLabel(
  item: MenuItem,
  categoryById: Map<number, MenuCategory>,
  nowMs = Date.now()
): string | null {
  if (effectiveInStock(item, categoryById, nowMs)) return null;
  if (item.category_id != null) {
    const c = categoryById.get(item.category_id);
    if (c && isItemBlockedByCategoryOos(item, c, nowMs)) {
      if (c.out_of_stock_manual) return "Out of stock (category) · manual";
      if (c.out_of_stock_until && isOosActive(c.out_of_stock_manual, c.out_of_stock_until, nowMs)) {
        const fmt = formatOosUntil(c.out_of_stock_until);
        return fmt ? `Out of stock (category) till ${fmt}` : "Out of stock (category)";
      }
      return "Out of stock (category)";
    }
  }
  if (item.out_of_stock_manual) return "Out of stock · manual";
  if (item.out_of_stock_until) {
    if (isOosActive(item.out_of_stock_manual, item.out_of_stock_until, nowMs)) {
      const fmt = formatOosUntil(item.out_of_stock_until);
      return fmt ? `Out of stock till ${fmt}` : "Out of stock";
    }
  }
  if (item.in_stock === false) return "Out of stock";
  return "Out of stock";
}
