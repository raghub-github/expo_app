import { prefetchAuthImage } from "@/components/AuthProxyImage";
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

export function invalidateMenuItemCache(storeId: string | number, itemId: number): void {
  cache.delete(menuItemCacheKey(storeId, itemId));
}

function warmMenuItemImageCache(detail: MenuItemDetail, token: string): void {
  void prefetchAuthImage(detail.item_image_url, token);
  for (const img of detail.images ?? []) {
    void prefetchAuthImage(img.image_url, token);
  }
}

/** Warm item detail + image files before opening photo/edit sheets. */
export function prefetchMenuItemDetail(
  storeId: string | number,
  itemId: number,
  token: string,
): void {
  const cached = getCachedMenuItem(storeId, itemId);
  if (cached) {
    warmMenuItemImageCache(cached, token);
    return;
  }
  void fetchMenuItem(String(storeId), itemId, token)
    .then((detail) => {
      if (!detail) return;
      setCachedMenuItem(storeId, itemId, detail);
      warmMenuItemImageCache(detail, token);
    })
    .catch(() => {});
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
    void fetchMenuItem(String(storeId), id, token)
      .then((detail) => {
        if (!detail) return;
        setCachedMenuItem(storeId, id, detail);
        warmMenuItemImageCache(detail, token);
      })
      .catch(() => {});
  }
}
