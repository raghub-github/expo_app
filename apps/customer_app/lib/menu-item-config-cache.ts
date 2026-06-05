import type { MenuItemFullConfig } from "@/services/merchant.service";

const CACHE_TTL_MS = 15 * 60 * 1000;
const memoryCache = new Map<string, { data: MenuItemFullConfig; at: number }>();

export function getCachedMenuItemFullConfig(
  storeId: string,
  itemId: string
): MenuItemFullConfig | undefined {
  const entry = memoryCache.get(`${storeId}:${itemId}`);
  if (!entry || Date.now() - entry.at > CACHE_TTL_MS) return undefined;
  return entry.data;
}

export function setCachedMenuItemFullConfig(
  storeId: string,
  itemId: string,
  data: MenuItemFullConfig | null | undefined
): void {
  if (!data) return;
  memoryCache.set(`${storeId}:${itemId}`, { data, at: Date.now() });
}

export function clearCachedMenuItemFullConfig(storeId: string, itemId: string): void {
  memoryCache.delete(`${storeId}:${itemId}`);
}

export const MENU_ITEM_CONFIG_CACHE_TTL_MS = CACHE_TTL_MS;
