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

function itemHasImage(item: Pick<MenuItem, "imageUrl">): boolean {
  return Boolean(item.imageUrl?.trim());
}

function sectionHasImages(sec: MenuSection): boolean {
  const catImg = sec.data[0]?.categoryImageUrl?.trim();
  if (catImg) return true;
  return sec.data.some(itemHasImage);
}

function sectionOrderVolume(sec: MenuSection): number {
  return sec.data.reduce((sum, item) => sum + Math.max(0, Number(item.orderCount ?? 0)), 0);
}

function sectionDisplayOrder(sec: MenuSection): number {
  const raw = sec.data[0]?.categoryDisplayOrder;
  return raw != null && Number.isFinite(raw) ? raw : Number.MAX_SAFE_INTEGER;
}

/** Items with photos + store-wide repeat orders float to the top of each category. */
export function compareMenuItemsForInnerPage(a: MenuItem, b: MenuItem): number {
  const img = Number(itemHasImage(b)) - Number(itemHasImage(a));
  if (img !== 0) return img;
  const orders = Math.max(0, Number(b.orderCount ?? 0)) - Math.max(0, Number(a.orderCount ?? 0));
  if (orders !== 0) return orders;
  const popular = Number(b.isPopular === true) - Number(a.isPopular === true);
  if (popular !== 0) return popular;
  const recommended = Number(b.isRecommended === true) - Number(a.isRecommended === true);
  if (recommended !== 0) return recommended;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

/**
 * Inner store page ranking:
 * 1) Categories that have images (category tile or item photos)
 * 2) Categories with the most repeat customer orders for this store
 * 3) Merchant display_order
 * Within each category, photo + high-order items come first.
 */
export function sortMenuSectionsForInnerPage(sections: MenuSection[]): MenuSection[] {
  if (sections.length === 0) return sections;
  const sortedItems = sections.map((sec) => ({
    ...sec,
    data: [...sec.data].sort(compareMenuItemsForInnerPage) as MenuListRow[],
  }));
  return [...sortedItems].sort((a, b) => {
    if (Boolean(a.isSmart) !== Boolean(b.isSmart)) return a.isSmart ? -1 : 1;
    const img = Number(sectionHasImages(b)) - Number(sectionHasImages(a));
    if (img !== 0) return img;
    const volume = sectionOrderVolume(b) - sectionOrderVolume(a);
    if (volume !== 0) return volume;
    const display = sectionDisplayOrder(a) - sectionDisplayOrder(b);
    if (display !== 0) return display;
    return 0;
  });
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
