import type { MenuItem } from "@/services/merchant.service";
import type { OrderSummary } from "@/services/order.service";
import type { ComboPair } from "./StoreComboSection";
import { resolveItemDiet, type ItemDiet } from "@/lib/itemDiet";

export type { ItemDiet };

export function getItemDiet(item: Pick<MenuItem, "foodType" | "isVeg">): ItemDiet {
  return resolveItemDiet({ foodType: item.foodType, isVeg: item.isVeg });
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
  const canon = item.canonicalPricing;
  if (canon && typeof canon === "object") {
    const strike = Number(
      (canon as { customer_strike_unit?: unknown; customerStrikeUnit?: unknown })
        .customer_strike_unit ??
        (canon as { customerStrikeUnit?: unknown }).customerStrikeUnit
    );
    if (Number.isFinite(strike) && strike > item.price) return strike;
  }
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

/** Resolve a menu row strictly within the current store menu (no cross-store / fuzzy match). */
function resolveMenuItemInStoreMenu(
  menu: MenuItem[],
  pk: number,
  publicId: string
): MenuItem | undefined {
  const idKey = publicId.trim();
  const byPk = menu.filter((m) => m.menuItemId != null && m.menuItemId === pk);
  if (byPk.length === 1) {
    const only = byPk[0]!;
    if (!idKey || only.id === idKey) return only;
  }
  if (idKey) {
    const byId = menu.find((m) => m.id === idKey);
    if (byId && byId.menuItemId != null && byId.menuItemId === pk) return byId;
    if (byId && byPk.length === 0) return byId;
  }
  return undefined;
}

/** Map API rows to combo cards. Skips pairs whose items are not on the current store menu. */
export function mapOrderedTogetherPairsToCombos(
  menu: MenuItem[],
  pairs: Array<{
    id: string;
    item1Id: string;
    item2Id: string;
    item1MenuItemPk: number;
    item2MenuItemPk: number;
    orderCount: number;
    source?: "co_purchase" | "popular_fallback";
  }>
): ComboPair[] {
  if (!menu.length || !pairs.length) return [];

  const out: ComboPair[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const item1 = resolveMenuItemInStoreMenu(menu, pair.item1MenuItemPk, pair.item1Id);
    const item2 = resolveMenuItemInStoreMenu(menu, pair.item2MenuItemPk, pair.item2Id);
    if (!item1 || !item2 || item1.id === item2.id) continue;
    const dedupeKey = [item1.id, item2.id].sort().join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      id: pair.id,
      item1,
      item2,
      customerCount: pair.orderCount,
      source: pair.source,
    });
  }
  return out;
}

/** Per-anchor pairs → menu items frequently bought with the anchor (item2 side). */
export function mapAnchorPairsToCompanionItems(
  menu: MenuItem[],
  anchorItemId: string,
  pairs: Array<{
    item1Id: string;
    item2Id: string;
    item1MenuItemPk: number;
    item2MenuItemPk: number;
    orderCount: number;
    source?: "co_purchase" | "popular_fallback";
  }>
): Array<{ item: MenuItem; orderCount: number; source?: "co_purchase" | "popular_fallback" }> {
  if (!menu.length || !pairs.length) return [];
  const combos = mapOrderedTogetherPairsToCombos(menu, pairs as Parameters<typeof mapOrderedTogetherPairsToCombos>[1]);
  const anchorKey = anchorItemId.trim();
  const out: Array<{ item: MenuItem; orderCount: number; source?: "co_purchase" | "popular_fallback" }> = [];
  for (const combo of combos) {
    const companion =
      combo.item1.id === anchorKey || String(combo.item1.menuItemId) === anchorKey
        ? combo.item2
        : combo.item2.id === anchorKey || String(combo.item2.menuItemId) === anchorKey
          ? combo.item1
          : combo.item2;
    if (companion.id === anchorKey) continue;
    out.push({
      item: companion,
      orderCount: combo.customerCount ?? 0,
      source: combo.source,
    });
  }
  return out;
}

/** Side dishes / pairings to show below the anchor item after it is added to cart. */
export function resolvePairingCompanionsForAnchor(
  menu: MenuItem[],
  anchor: MenuItem,
  byAnchor: Record<string, Array<{
    item1Id: string;
    item2Id: string;
    item1MenuItemPk: number;
    item2MenuItemPk: number;
    orderCount: number;
    source?: "co_purchase" | "popular_fallback";
  }>>,
  fallbackPairs: Array<{
    item1Id: string;
    item2Id: string;
    item1MenuItemPk: number;
    item2MenuItemPk: number;
    orderCount: number;
    source?: "co_purchase" | "popular_fallback";
  }> = []
): MenuItem[] {
  if (!menu.length) return [];
  const anchorKeys = [
    anchor.id,
    anchor.menuItemId != null ? String(anchor.menuItemId) : null,
  ].filter(Boolean) as string[];
  let pairs = fallbackPairs;
  for (const key of anchorKeys) {
    const hit = byAnchor[key];
    if (hit?.length) {
      pairs = hit;
      break;
    }
  }
  if (!pairs.length) {
    pairs = fallbackPairs.filter(
      (p) =>
        p.item1Id === anchor.id ||
        p.item2Id === anchor.id ||
        (anchor.menuItemId != null &&
          (p.item1MenuItemPk === anchor.menuItemId || p.item2MenuItemPk === anchor.menuItemId))
    );
  }
  const mapped = mapAnchorPairsToCompanionItems(menu, anchor.id, pairs);
  const seen = new Set<string>();
  const out: MenuItem[] = [];
  for (const { item } of mapped) {
    if (item.id === anchor.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= 8) break;
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
