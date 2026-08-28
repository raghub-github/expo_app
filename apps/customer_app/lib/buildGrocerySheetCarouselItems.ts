import type { MenuItem } from "@/services/merchant.service";

const MAX_CAROUSEL_ITEMS = 24;

/** Menu items for the grocery peek carousel — same category first, then the rest. */
export function buildGrocerySheetCarouselItems(
  storeMenu: MenuItem[] | undefined,
  activeItem: MenuItem | null | undefined
): MenuItem[] {
  if (!activeItem || !storeMenu?.length) return [];

  const activeKey = String(activeItem.id);
  const category = activeItem.category?.trim().toLowerCase() ?? "";
  const sameCategory: MenuItem[] = [];
  const other: MenuItem[] = [];

  for (const row of storeMenu) {
    if (String(row.id) === activeKey) continue;
    const rowCategory = row.category?.trim().toLowerCase() ?? "";
    if (category && rowCategory === category) sameCategory.push(row);
    else other.push(row);
  }

  const ordered = [activeItem, ...sameCategory, ...other];
  const seen = new Set<string>();
  const unique: MenuItem[] = [];
  for (const row of ordered) {
    const key = String(row.id);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= MAX_CAROUSEL_ITEMS) break;
  }
  return unique;
}
