import type { MenuItem } from "@/services/merchant.service";
import type { OrderSummary } from "@/services/order.service";
import type { ComboPair } from "./StoreComboSection";

export type ItemDiet = "veg" | "egg" | "nonveg";

export function getItemDiet(item: MenuItem): ItemDiet {
  const ft = (item.foodType ?? "").toLowerCase();
  if (ft.includes("egg")) return "egg";
  if (ft.includes("non") || ft.includes("nonveg") || ft.includes("non-veg")) return "nonveg";
  if (item.isVeg || ft.startsWith("veg")) return "veg";
  return "nonveg";
}

export function isItemSpicy(item: MenuItem): boolean {
  const level = (item.spiceLevel ?? "").toLowerCase();
  return level.includes("spicy") || level.includes("hot") || level === "medium" || level === "high";
}

export function getSellingPrice(item: MenuItem): number {
  return item.price;
}

export function getBasePrice(item: MenuItem): number | null {
  if (item.basePrice != null && item.basePrice > item.price) return item.basePrice;
  if (item.discountPercentage != null && item.discountPercentage > 0) {
    const pct = item.discountPercentage / 100;
    if (pct < 1) return Math.round(item.price / (1 - pct));
  }
  return null;
}

function orderMatchesStore(
  order: OrderSummary,
  merchantId: string,
  storeName: string
): boolean {
  return (
    order.merchantPublicStoreId === merchantId ||
    (order.merchantStoreId != null && String(order.merchantStoreId) === merchantId) ||
    (order.merchantName ?? "").toLowerCase().includes(storeName.slice(0, Math.min(8, storeName.length)))
  );
}

/** Items reordered 2+ times at this store in the user's order history, or flagged popular by the store. */
export function buildHighlyReorderedIds(
  menu: MenuItem[],
  myOrders: OrderSummary[],
  merchantId: string,
  storeName: string
): Set<string> {
  const menuByName = new Map(menu.map((m) => [(m.name ?? "").toLowerCase().trim(), m]));
  const counts = new Map<string, number>();
  const storeKey = storeName.toLowerCase().trim();

  for (const order of myOrders) {
    if (!orderMatchesStore(order, merchantId, storeKey)) continue;
    for (const line of order.items ?? []) {
      const menuItem = menuByName.get((line.name ?? "").toLowerCase().trim());
      if (!menuItem) continue;
      counts.set(menuItem.id, (counts.get(menuItem.id) ?? 0) + 1);
    }
  }

  const ids = new Set<string>();
  for (const item of menu) {
    if (item.isPopular === true) ids.add(item.id);
    if ((counts.get(item.id) ?? 0) >= 2) ids.add(item.id);
  }
  return ids;
}

/** Map API ordered-together rows to menu combo cards. Skips pairs whose items are not on the current menu. */
export function mapOrderedTogetherPairsToCombos(
  menu: MenuItem[],
  pairs: Array<{
    id: string;
    item1Id: string;
    item2Id: string;
    item1MenuItemPk: number;
    item2MenuItemPk: number;
    orderCount: number;
  }>
): ComboPair[] {
  if (!menu.length || !pairs.length) return [];

  const byPk = new Map<number, MenuItem>();
  const byId = new Map<string, MenuItem>();
  for (const item of menu) {
    byId.set(item.id, item);
    if (item.menuItemId != null) byPk.set(item.menuItemId, item);
  }

  const out: ComboPair[] = [];
  for (const pair of pairs) {
    const item1 =
      byPk.get(pair.item1MenuItemPk) ??
      byId.get(pair.item1Id) ??
      menu.find((m) => String(m.menuItemId) === String(pair.item1MenuItemPk));
    const item2 =
      byPk.get(pair.item2MenuItemPk) ??
      byId.get(pair.item2Id) ??
      menu.find((m) => String(m.menuItemId) === String(pair.item2MenuItemPk));
    if (!item1 || !item2) continue;
    out.push({
      id: pair.id,
      item1,
      item2,
      customerCount: pair.orderCount,
    });
  }
  return out;
}

export function buildOfferPriceTiers(menu: MenuItem[]): number[] {
  const prices = new Set<number>();
  for (const item of menu) {
    const selling = getSellingPrice(item);
    if (selling > 0) prices.add(Math.round(selling));
  }
  return Array.from(prices).sort((a, b) => a - b).slice(0, 12);
}

export type MenuFilterOptions = {
  searchQuery?: string;
  quickFilter?: "all" | "veg" | "egg" | "nonveg" | "highlyreordered";
  advanced?: {
    sortBy: "default" | "price_asc" | "price_desc";
    veg: boolean;
    egg: boolean;
    nonveg: boolean;
    highlyReordered: boolean;
    spicy: boolean;
    offerPrices: number[];
  };
  highlyReorderedIds: Set<string>;
};

export function filterMenuItems(menu: MenuItem[], opts: MenuFilterOptions): MenuItem[] {
  let list = [...menu];
  const q = (opts.searchQuery ?? "").trim().toLowerCase();
  if (q) list = list.filter((m) => (m.name ?? "").toLowerCase().includes(q));

  const quick = opts.quickFilter ?? "all";
  if (quick === "veg") list = list.filter((m) => getItemDiet(m) === "veg");
  else if (quick === "egg") list = list.filter((m) => getItemDiet(m) === "egg");
  else if (quick === "nonveg") list = list.filter((m) => getItemDiet(m) === "nonveg");
  else if (quick === "highlyreordered") {
    list = list.filter((m) => opts.highlyReorderedIds.has(m.id));
  }

  const adv = opts.advanced;
  if (adv) {
    if (adv.veg || adv.egg || adv.nonveg) {
      list = list.filter((m) => {
        const diet = getItemDiet(m);
        if (adv.veg && diet === "veg") return true;
        if (adv.egg && diet === "egg") return true;
        if (adv.nonveg && diet === "nonveg") return true;
        return false;
      });
    }
    if (adv.highlyReordered) {
      list = list.filter((m) => opts.highlyReorderedIds.has(m.id));
    }
    if (adv.spicy) {
      list = list.filter((m) => isItemSpicy(m));
    }
    if (adv.offerPrices.length > 0) {
      list = list.filter((m) => adv.offerPrices.includes(Math.round(getSellingPrice(m))));
    }
    if (adv.sortBy === "price_asc") {
      list.sort((a, b) => getSellingPrice(a) - getSellingPrice(b));
    } else if (adv.sortBy === "price_desc") {
      list.sort((a, b) => getSellingPrice(b) - getSellingPrice(a));
    }
  }

  return list;
}

export function hasActiveAdvancedFilters(adv: MenuFilterOptions["advanced"]): boolean {
  if (!adv) return false;
  return (
    adv.sortBy !== "default" ||
    adv.veg ||
    adv.egg ||
    adv.nonveg ||
    adv.highlyReordered ||
    adv.spicy ||
    adv.offerPrices.length > 0
  );
}
