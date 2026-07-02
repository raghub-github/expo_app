import type { ListItemsResponse, MenuCategory } from "@/services/menuApi";

type MenuCatalogSnapshot = {
  categories: MenuCategory[];
  catalog: ListItemsResponse;
  savedAt: number;
};

const snapshots = new Map<string, MenuCatalogSnapshot>();

export function readMenuCatalogSnapshot(storeId: string | null): MenuCatalogSnapshot | null {
  if (!storeId) return null;
  return snapshots.get(storeId) ?? null;
}

export function writeMenuCatalogCategories(storeId: string, categories: MenuCategory[]): void {
  const prev = snapshots.get(storeId);
  snapshots.set(storeId, {
    categories,
    catalog: prev?.catalog ?? { items: [], total: 0 },
    savedAt: Date.now(),
  });
}

export function writeMenuCatalogItems(storeId: string, catalog: ListItemsResponse): void {
  const prev = snapshots.get(storeId);
  snapshots.set(storeId, {
    categories: prev?.categories ?? [],
    catalog,
    savedAt: Date.now(),
  });
}
