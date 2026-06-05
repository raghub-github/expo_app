import type { QueryClient } from "@tanstack/react-query";
import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import {
  getCachedMenuItemFullConfig,
  setCachedMenuItemFullConfig,
  clearCachedMenuItemFullConfig,
  MENU_ITEM_CONFIG_CACHE_TTL_MS,
} from "@/lib/menu-item-config-cache";

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

export async function prefetchMenuItemFullConfig(
  queryClient: QueryClient,
  storeId: string,
  itemId: string
): Promise<void> {
  if (!storeId || !itemId) return;
  const queryKey = menuItemConfigQueryKey(storeId, itemId);
  const cached = getCachedMenuItemFullConfig(storeId, itemId);
  if (cached) {
    queryClient.setQueryData(queryKey, cached);
    return;
  }
  await queryClient.prefetchQuery({
    queryKey,
    queryFn: async () => {
      const { merchantService } = await import("@/services/merchant.service");
      const data = await merchantService.getMenuItemFullConfig(storeId, itemId);
      if (data) setCachedMenuItemFullConfig(storeId, itemId, data);
      return data;
    },
    staleTime: MENU_ITEM_CONFIG_CACHE_TTL_MS,
  });
}

/** Warm full-config for customizable menu rows (background, limited concurrency). */
export function prefetchMenuItemFullConfigsForMenu(
  queryClient: QueryClient,
  storeId: string,
  menu: MenuItem[],
  concurrency = 4
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
