/**
 * Match under-price menu items to a home category name/slug for “FROM ₹” badges
 * and classic store-card category-diverse item rails.
 */

import type { FoodItemUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";

export type ClassicCategoryRef = {
  id: string;
  name: string;
  slug: string;
};

function normalizeNeedle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the item likely belongs to this category label. */
export function itemMatchesCategoryLabel(
  item: Pick<FoodItemUnderPrice, "name" | "itemTags">,
  categoryName: string,
  categorySlug?: string
): boolean {
  const needles = [categoryName, categorySlug ?? ""]
    .map(normalizeNeedle)
    .filter((n) => n.length >= 2);
  if (needles.length === 0) return false;
  const hay = normalizeNeedle(
    `${item.name} ${(item.itemTags ?? []).join(" ")}`
  );
  const tokens = new Set(hay.split(" ").filter(Boolean));
  return needles.some((n) => {
    // Short labels (tea, egg) must match a whole token — avoid "tea" in "steamed".
    if (n.length <= 4) return tokens.has(n);
    return hay.includes(n) || tokens.has(n);
  });
}

/** Lowest positive price among items matching the category, or null. */
export function minPriceForCategory(
  items: FoodItemUnderPrice[],
  categoryName: string,
  categorySlug?: string
): number | null {
  let min = Infinity;
  for (const item of items) {
    if (!itemMatchesCategoryLabel(item, categoryName, categorySlug)) continue;
    if (!(item.price > 0)) continue;
    if (item.price < min) min = item.price;
  }
  return Number.isFinite(min) ? min : null;
}

/** Map category id → min price (only categories with a real match). */
export function buildCategoryFromPriceMap(
  categories: ClassicCategoryRef[],
  items: FoodItemUnderPrice[]
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!items.length) return out;
  for (const cat of categories) {
    const min = minPriceForCategory(items, cat.name, cat.slug);
    if (min != null) out[cat.id] = min;
  }
  return out;
}

/**
 * One lowest-priced imaged item per home category (no same-category dump).
 * Categories without a matching item contribute nothing; order is cheapest-first.
 */
export function pickLowestItemPerCategory(
  items: FoodItemUnderPrice[],
  categories: ClassicCategoryRef[],
  limit = 12
): FoodItemUnderPrice[] {
  if (limit <= 0 || items.length === 0 || categories.length === 0) return [];

  const imaged = items.filter(
    (i) => Boolean(i.imageUrl?.trim()) && Number.isFinite(i.price) && i.price > 0
  );
  if (imaged.length === 0) return [];

  const usedItemIds = new Set<string>();
  const picks: FoodItemUnderPrice[] = [];

  // Cheapest category first so conflict resolution prefers lower-price coverage.
  const catsRanked = categories
    .map((cat) => {
      const min = minPriceForCategory(imaged, cat.name, cat.slug);
      return min == null ? null : { cat, min };
    })
    .filter(Boolean)
    .sort((a, b) => a!.min - b!.min) as Array<{ cat: ClassicCategoryRef; min: number }>;

  for (const { cat } of catsRanked) {
    if (picks.length >= limit) break;
    let best: FoodItemUnderPrice | null = null;
    for (const item of imaged) {
      if (usedItemIds.has(item.itemId)) continue;
      if (!itemMatchesCategoryLabel(item, cat.name, cat.slug)) continue;
      if (!best || item.price < best.price) best = item;
    }
    if (!best) continue;
    usedItemIds.add(best.itemId);
    picks.push(best);
  }

  return picks;
}
