/** Item/category row shapes needed for effective in-stock (Partner Site parity). */

export type MenuOosRow = {
  in_stock?: boolean | null;
  out_of_stock_manual?: boolean | null;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
};

export type MenuItemOosRow = MenuOosRow & {
  category_out_of_stock_manual?: boolean | null;
  category_out_of_stock_until?: string | null;
  category_out_of_stock_updated_at?: string | null;
};

function isTimedOosActive(until: string | null | undefined, now = Date.now()): boolean {
  if (!until) return false;
  const ts = new Date(until).getTime();
  return Number.isFinite(ts) && ts > now;
}

export function isMenuCategoryEffectivelyInStock(
  category: MenuOosRow | null | undefined,
  now = Date.now(),
): boolean {
  if (!category) return true;
  if (category.out_of_stock_manual) return false;
  if (isTimedOosActive(category.out_of_stock_until, now)) return false;
  return true;
}

export function isMenuItemEffectivelyInStock(
  item: MenuItemOosRow,
  category?: MenuOosRow | null,
  now = Date.now(),
): boolean {
  if (item.out_of_stock_manual) return false;
  if (isTimedOosActive(item.out_of_stock_until, now)) return false;

  const catManual = item.category_out_of_stock_manual ?? category?.out_of_stock_manual;
  const catUntil = item.category_out_of_stock_until ?? category?.out_of_stock_until;
  const catUpdated = item.category_out_of_stock_updated_at ?? category?.out_of_stock_updated_at;
  const itemUpdated = item.out_of_stock_updated_at;

  if (
    (catManual || isTimedOosActive(catUntil, now)) &&
    catUpdated &&
    itemUpdated &&
    catUpdated === itemUpdated
  ) {
    return false;
  }

  if (
    !item.out_of_stock_manual &&
    !item.out_of_stock_until &&
    item.in_stock === false &&
    !item.out_of_stock_updated_at
  ) {
    return false;
  }

  return true;
}
