import type { MenuItem } from "@/services/merchant.service";
import type { MenuListRow, MenuSection } from "../types";

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

/** Smart sections first, then DB categories. */
export function buildMenuSections(menu: MenuItem[]): MenuSection[] {
  const out: MenuSection[] = [];
  const recommended = menu.filter((m) => m.isRecommended);
  const popular = menu.filter((m) => m.isPopular);
  if (recommended.length > 0) {
    out.push({ title: "Recommended for you", data: recommended as MenuListRow[], isSmart: true });
  }
  if (popular.length > 0) {
    out.push({ title: "Best in category", data: popular as MenuListRow[], isSmart: true });
  }
  const categorySections = groupMenuByCategory(menu);
  categorySections.forEach((s) => out.push({ ...s, data: s.data as MenuListRow[], isSmart: false }));
  return out;
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
