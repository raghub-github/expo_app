/**
 * Helpers that take raw menu rows (with `base_price` / `selling_price`) and
 * rewrite `selling_price` to the commission-included customer price. This is
 * the *only* place customer-facing prices should be computed for menu reads —
 * it keeps the resolver call once per store regardless of item count.
 *
 * Why we overwrite `selling_price` instead of adding a new field:
 *  - Every customer client (cart, checkout, search, customization sheet)
 *    already reads `selling_price`. Adding a new field would require coordinated
 *    deploys across three apps.
 *  - The resolver runs server-side; the client stays oblivious to the markup
 *    and shows "single transparent customer price" exactly as the user asked.
 */

import { resolveStoreCommission, type ResolvedCommission } from "./commission.resolver.js";
import { customerPriceFromBase } from "./pricing.js";

type MenuItemLike = {
  store_id?: number;
  base_price: string;
  selling_price: string;
};

const NEAREST = "NEAREST_RUPEE" as const;

function applyPercentToItem(item: MenuItemLike, percent: number): void {
  const baseRupees = parseFloat(item.base_price);
  if (!Number.isFinite(baseRupees) || baseRupees <= 0) return;
  const basePaise = Math.round(baseRupees * 100);
  const { customerPaise } = customerPriceFromBase(basePaise, percent, NEAREST);
  item.selling_price = (customerPaise / 100).toFixed(2);
}

/** Single-store: call resolver once, mutate all items in place. */
export async function applyCommissionToStoreItems<T extends MenuItemLike>(
  storeId: number,
  items: T[],
): Promise<{ items: T[]; commission: ResolvedCommission }> {
  const commission = await resolveStoreCommission(storeId);
  for (const item of items) applyPercentToItem(item, commission.percent);
  return { items, commission };
}

/** Multi-store (search): group items by store_id, resolve once per store. */
export async function applyCommissionToMultiStoreItems<T extends MenuItemLike>(
  items: T[],
): Promise<T[]> {
  const byStore = new Map<number, T[]>();
  for (const it of items) {
    if (!it.store_id) continue;
    const arr = byStore.get(it.store_id) ?? [];
    arr.push(it);
    byStore.set(it.store_id, arr);
  }
  await Promise.all(
    Array.from(byStore.entries()).map(async ([storeId, group]) => {
      const c = await resolveStoreCommission(storeId);
      for (const item of group) applyPercentToItem(item, c.percent);
    }),
  );
  return items;
}

/** For single-item endpoints (e.g. customization sheet) returning a typed shape with a `price` number field. */
export async function applyCommissionToSingleItem<T extends { store_id?: number }>(
  storeId: number,
  basePriceStr: string,
  setPrice: (priceRupees: number) => T,
): Promise<{ value: T; commission: ResolvedCommission }> {
  const commission = await resolveStoreCommission(storeId);
  const baseRupees = parseFloat(basePriceStr);
  const basePaise = Math.round(baseRupees * 100);
  const { customerPaise } = customerPriceFromBase(basePaise, commission.percent, NEAREST);
  return { value: setPrice(customerPaise / 100), commission };
}
