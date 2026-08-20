import type { MenuItem } from "@/services/merchant.service";
import type { MenuListRow, MenuSection } from "../types";

/** Collapse rows that describe the same dish, so a repeated API row never renders twice. */
export function dedupeMenuItems(menu: MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  const out: MenuItem[] = [];
  for (const item of menu) {
    const key = item.menuItemId != null ? `pk:${item.menuItemId}` : `id:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Group menu by category_id / categoryName from DB. */
export function groupMenuByCategory(menu: MenuItem[]): { title: string; data: MenuItem[] }[] {
  const byKey = new Map<string, { title: string; data: MenuItem[] }>();
  menu.forEach((item) => {
    const name = (item.categoryName ?? item.category ?? "").trim() || "Other";
    const key = item.categoryId != null ? `id:${item.categoryId}` : `name:${name}`;
    if (!byKey.has(key)) byKey.set(key, { title: name, data: [] });
    byKey.get(key)!.data.push(item);
  });
  const sections = Array.from(byKey.values()).filter((s) => s.data.length > 0);
  if (sections.length === 0 && menu.length > 0) return [{ title: "Menu", data: menu }];
  return sections;
}

/**
 * DB categories only — every dish appears exactly once. The old "Recommended for you" /
 * "Best in category" sections repeated dishes that also live in a category (and a dish flagged
 * both showed up three times). Those signals now ride along on the row itself as badges.
 */
export function buildMenuSections(menu: MenuItem[]): MenuSection[] {
  const unique = dedupeMenuItems(menu);
  return groupMenuByCategory(unique).map((s) => ({
    ...s,
    data: s.data as MenuListRow[],
    isSmart: false,
  }));
}

/** Categories with 2+ dishes first; single-item categories stay below. Relative order is kept. */
export function sortMenuSectionsMultiItemFirst(sections: MenuSection[]): MenuSection[] {
  if (sections.length < 2) return sections;
  const multi: MenuSection[] = [];
  const rest: MenuSection[] = [];
  for (const sec of sections) {
    if (!sec.isSmart && sec.data.length > 1) multi.push(sec);
    else rest.push(sec);
  }
  if (multi.length === 0 || rest.length === 0) return sections;
  return [...multi, ...rest];
}

/**
 * One flat section that preserves the incoming order. Used when an explicit sort is active:
 * re-grouping a price-sorted list by category scatters it back into per-category runs, which
 * reads as "sorting does nothing".
 */
export function buildSortedMenuSection(menu: MenuItem[], title: string): MenuSection[] {
  const unique = dedupeMenuItems(menu);
  if (unique.length === 0) return [];
  return [{ title, data: unique as MenuListRow[], isSmart: true }];
}

export function lowestAvailableMenuPrice(menu: MenuItem[]): number | null {
  const prices = menu
    .filter((m) => m.inStock !== false)
    .map((m) => m.price)
    .filter((p) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function attachListRowKeys(sections: MenuSection[]): MenuSection[] {
  return sections.map((sec, sIdx) => ({
    ...sec,
    data: sec.data.map(
      (item, iIdx): MenuListRow => ({
        ...item,
        listRowKey: `${sIdx}-${String(item.menuItemId != null ? item.menuItemId : item.id)}-${iIdx}`,
      })
    ),
  }));
}
