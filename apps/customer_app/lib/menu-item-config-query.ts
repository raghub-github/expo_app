import { merchantService } from "@/services/merchant.service";
import type { QueryClient } from "@tanstack/react-query";
import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import {
  getCachedMenuItemFullConfig,
  setCachedMenuItemFullConfig,
  clearCachedMenuItemFullConfig,
  MENU_ITEM_CONFIG_CACHE_TTL_MS,
} from "@/lib/menu-item-config-cache";
import { normalizeMenuItemFullConfig } from "@/lib/normalize-menu-item-full-config";

export {
  getCachedMenuItemFullConfig,
  setCachedMenuItemFullConfig,
  clearCachedMenuItemFullConfig,
};

export function menuItemConfigQueryKey(storeId: string, itemId: string) {
  return ["menu-item-full-config", storeId, itemId] as const;
}

/** API `item_id`; cart lines may use numeric menu PK only. */
export function resolveFullConfigItemId(item: Pick<MenuItem, "id" | "menuItemId">): string {
  const idStr = String(item.id ?? "").trim();
  const pkStr = item.menuItemId != null ? String(item.menuItemId) : "";
  if (idStr && idStr !== pkStr) return idStr;
  return pkStr || idStr;
}

/** True when a fetched full-config belongs to the sheet's requested item key. */
export function fullConfigMatchesItemKey(
  config: MenuItemFullConfig,
  configItemKey: string
): boolean {
  const key = String(configItemKey ?? "").trim();
  if (!key) return false;
  if (resolveFullConfigItemId(config.item) === key) return true;
  if (String(config.item.id ?? "").trim() === key) return true;
  if (config.item.menuItemId != null && String(config.item.menuItemId) === key) return true;
  return false;
}

/** Flags on the menu row, or a warmed full-config cache entry with real options. */
export function menuItemNeedsCustomization(
  item: MenuItem,
  storeId?: string | null
): boolean {
  if (item.hasVariants || item.hasAddons || item.hasCustomizations) return true;
  if (!storeId) return false;
  const configItemId = resolveFullConfigItemId(item);
  const cached = getCachedMenuItemFullConfig(storeId, configItemId);
  if (!cached) return false;
  const normalized = normalizeMenuItemFullConfig(cached);
  return (normalized.variants?.length ?? 0) > 0 || (normalized.customizations?.length ?? 0) > 0;
}

/** Push a memory-cache hit into React Query so the sheet can paint without waiting. */
export function seedMenuItemFullConfigQuery(
  queryClient: QueryClient,
  storeId: string,
  itemId: string
): MenuItemFullConfig | undefined {
  if (!storeId || !itemId) return undefined;
  const queryKey = menuItemConfigQueryKey(storeId, itemId);
  const cached = getCachedMenuItemFullConfig(storeId, itemId);
  if (cached) {
    queryClient.setQueryData(queryKey, cached);
    return cached;
  }
  return queryClient.getQueryData<MenuItemFullConfig>(queryKey);
}

export async function prefetchMenuItemFullConfig(
  queryClient: QueryClient,
  storeId: string,
  itemId: string
): Promise<void> {
  if (!storeId || !itemId) return;
  const queryKey = menuItemConfigQueryKey(storeId, itemId);
  if (seedMenuItemFullConfigQuery(queryClient, storeId, itemId)) return;
  const existingState = queryClient.getQueryState(queryKey);
  if (existingState?.status === "pending" && existingState.fetchStatus === "fetching") return;
  await queryClient.prefetchQuery({
    queryKey,
    queryFn: async () => {
      const data = await merchantService.getMenuItemFullConfig(storeId, itemId);
      if (!data) throw new Error("Item config unavailable");
      setCachedMenuItemFullConfig(storeId, itemId, data);
      return data;
    },
    staleTime: MENU_ITEM_CONFIG_CACHE_TTL_MS,
    retry: 0,
  });
}

/** Warm full-config for customizable menu rows (background, limited concurrency). */
export function prefetchMenuItemFullConfigsForMenu(
  queryClient: QueryClient,
  storeId: string,
  menu: MenuItem[],
  concurrency = 8
): void {
  const targets = menu.filter(
    (i) => i.hasVariants || i.hasAddons || i.hasCustomizations
  );
  if (targets.length === 0) return;
  let index = 0;
  const worker = async () => {
    while (index < targets.length) {
      const item = targets[index++]!;
      const itemId = resolveFullConfigItemId(item);
      await prefetchMenuItemFullConfig(queryClient, storeId, itemId).catch(() => {});
    }
  };
  const workers = Math.min(concurrency, targets.length);
  for (let w = 0; w < workers; w++) void worker();
}
