import type { MenuItem } from "@/services/merchant.service";
import { getBasePrice } from "@/components/store/storeMenuUtils";
import type { MenuListRow, MenuSection } from "../types";

/** True when the menu card would show a strike-through / offer price. */
export function menuItemHasStrikeThrough(item: MenuItem): boolean {
  const base = getBasePrice(item);
  return base != null && base > item.price + 0.001;
}

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

/** Public — Classic / featured rails only surface dishes with photos. */
export function menuItemHasImage(item: Pick<MenuItem, "imageUrl">): boolean {
  return itemHasImage(item);
}

function sectionHasImages(sec: MenuSection): boolean {
  const catImg = sec.data[0]?.categoryImageUrl?.trim();
  if (catImg) return true;
  return sec.data.some(itemHasImage);
}

/**
 * Classic inner page: keep category order, but each section leads with imaged
 * dishes (2-col grid). Items without photos are collected for a trailing list.
 */
export function partitionSectionsForClassicImagedView(sections: MenuSection[]): {
  imagedSections: MenuSection[];
  noImageItems: MenuListRow[];
  featuredImaged: MenuListRow[];
} {
  const imagedSections: MenuSection[] = [];
  const noImageItems: MenuListRow[] = [];
  const featuredPool: MenuListRow[] = [];

  for (const sec of sections) {
    const withImage: MenuListRow[] = [];
    const without: MenuListRow[] = [];
    for (const item of sec.data) {
      if (itemHasImage(item)) withImage.push(item);
      else without.push(item);
    }
    if (withImage.length > 0) {
      imagedSections.push({ ...sec, data: withImage });
      featuredPool.push(...withImage);
    }
    noImageItems.push(...without);
  }

  const featuredImaged = [...featuredPool]
    .sort(compareMenuItemsForInnerPage)
    .slice(0, 12) as MenuListRow[];

  return { imagedSections, noImageItems, featuredImaged };
}

function sectionOrderVolume(sec: MenuSection): number {
  return sec.data.reduce((sum, item) => sum + Math.max(0, Number(item.orderCount ?? 0)), 0);
}

function sectionDisplayOrder(sec: MenuSection): number {
  const raw = sec.data[0]?.categoryDisplayOrder;
  return raw != null && Number.isFinite(raw) ? raw : Number.MAX_SAFE_INTEGER;
}

/**
 * Inner-page item ranking:
 * 1) Strike-through / active offer price (Flash, % OFF, etc.)
 * 2) Photos + store-wide repeat orders
 */
export function compareMenuItemsForInnerPage(a: MenuItem, b: MenuItem): number {
  const offer = Number(menuItemHasStrikeThrough(b)) - Number(menuItemHasStrikeThrough(a));
  if (offer !== 0) return offer;
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

function sectionHasStrikeThrough(sec: MenuSection): boolean {
  return sec.data.some(menuItemHasStrikeThrough);
}

/**
 * Inner store page ranking:
 * 1) Pull every strike-through / offer item into a leading "Offers" block
 * 2) Remaining categories: images → order volume → display_order
 * Within each category, offer items come first, then photo + high-order.
 */
export function sortMenuSectionsForInnerPage(sections: MenuSection[]): MenuSection[] {
  if (sections.length === 0) return sections;
  const sortedItems = sections.map((sec) => ({
    ...sec,
    data: [...sec.data].sort(compareMenuItemsForInnerPage) as MenuListRow[],
  }));
  const ranked = [...sortedItems].sort((a, b) => {
    if (Boolean(a.isSmart) !== Boolean(b.isSmart)) return a.isSmart ? -1 : 1;
    const offer = Number(sectionHasStrikeThrough(b)) - Number(sectionHasStrikeThrough(a));
    if (offer !== 0) return offer;
    const img = Number(sectionHasImages(b)) - Number(sectionHasImages(a));
    if (img !== 0) return img;
    const volume = sectionOrderVolume(b) - sectionOrderVolume(a);
    if (volume !== 0) return volume;
    const display = sectionDisplayOrder(a) - sectionDisplayOrder(b);
    if (display !== 0) return display;
    return 0;
  });
  return promoteStrikeThroughItemsToTop(ranked);
}

/**
 * Move every dish with a visible strike / offer price into one leading section
 * so they sit at the top of the store menu list (no duplicates in later categories).
 */
export function promoteStrikeThroughItemsToTop(sections: MenuSection[]): MenuSection[] {
  if (sections.length === 0) return sections;
  const offerItems: MenuListRow[] = [];
  const rest: MenuSection[] = [];
  for (const sec of sections) {
    const offers: MenuListRow[] = [];
    const normal: MenuListRow[] = [];
    for (const item of sec.data) {
      if (menuItemHasStrikeThrough(item)) offers.push(item);
      else normal.push(item);
    }
    offerItems.push(...offers);
    if (normal.length > 0) rest.push({ ...sec, data: normal });
  }
  if (offerItems.length === 0) return sections;
  const uniqueOffers = dedupeMenuItems(offerItems) as MenuListRow[];
  uniqueOffers.sort(compareMenuItemsForInnerPage);
  return [{ title: "Offers", data: uniqueOffers, isSmart: true }, ...rest];
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
