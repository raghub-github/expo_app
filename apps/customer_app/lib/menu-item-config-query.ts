import type { QueryClient } from "@tanstack/react-query";
import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import { merchantService } from "@/services/merchant.service";

const CACHE_TTL_MS = 15 * 60 * 1000;
const memoryCache = new Map<string, { data: MenuItemFullConfig; at: number }>();

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
      const data = await merchantService.getMenuItemFullConfig(storeId, itemId);
      if (data) setCachedMenuItemFullConfig(storeId, itemId, data);
      return data;
    },
    staleTime: CACHE_TTL_MS,
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
