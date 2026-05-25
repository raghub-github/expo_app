import type { MenuItemDetail } from "@/services/menuApi";
import { fetchMenuItem } from "@/services/menuApi";

const cache = new Map<string, MenuItemDetail>();

export function menuItemCacheKey(storeId: string | number, itemId: number): string {
  return `${storeId}:${itemId}`;
}

export function getCachedMenuItem(storeId: string | number, itemId: number): MenuItemDetail | null {
  return cache.get(menuItemCacheKey(storeId, itemId)) ?? null;
}

export function setCachedMenuItem(
  storeId: string | number,
  itemId: number,
  detail: MenuItemDetail
): void {
  cache.set(menuItemCacheKey(storeId, itemId), detail);
}

/** Warm cache when orders load so item sheet opens without a spinner. */
export function prefetchMenuItemsForOrders(
  storeId: string | number,
  token: string,
  lineItems: Array<{ menuItemId?: number | null }>
): void {
  const pending = new Set<number>();
  for (const item of lineItems) {
    const id = item.menuItemId;
    if (id == null || !Number.isFinite(id) || getCachedMenuItem(storeId, id)) continue;
    pending.add(id);
  }
  for (const id of pending) {
    void fetchMenuItem(storeId, id, token)
      .then((detail) => {
        if (detail) setCachedMenuItem(storeId, id, detail);
      })
      .catch(() => {});
  }
}
