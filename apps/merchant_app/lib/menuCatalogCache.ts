import * as FileSystem from "expo-file-system/legacy";
import type { ListItemsResponse, MenuCategory } from "@/services/menuApi";
import { prefetchMenuImages } from "@/lib/menuImageDiskCache";

type MenuCatalogSnapshot = {
  categories: MenuCategory[];
  catalog: ListItemsResponse;
  savedAt: number;
};

const snapshots = new Map<string, MenuCatalogSnapshot>();
const DISK_FILE = "merchant_menu_catalog_v1.json";

function diskUri(): string | null {
  const base = FileSystem.documentDirectory;
  return base ? `${base}${DISK_FILE}` : null;
}

function persistSoon(): void {
  const uri = diskUri();
  if (!uri) return;
  const stores: Record<string, MenuCatalogSnapshot> = {};
  for (const [id, snap] of snapshots) stores[id] = snap;
  void FileSystem.writeAsStringAsync(uri, JSON.stringify({ stores })).catch(() => undefined);
}

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
  persistSoon();
}

export function writeMenuCatalogItems(storeId: string, catalog: ListItemsResponse): void {
  const prev = snapshots.get(storeId);
  snapshots.set(storeId, {
    categories: prev?.categories ?? [],
    catalog,
    savedAt: Date.now(),
  });
  persistSoon();
  prefetchMenuImages(catalog.items.map((it) => it.item_image_url));
}

export async function hydrateMenuCatalogCache(): Promise<void> {
  if (snapshots.size > 0) return;
  const uri = diskUri();
  if (!uri) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return;
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as { stores?: Record<string, MenuCatalogSnapshot> };
    if (!parsed?.stores) return;
    for (const [id, snap] of Object.entries(parsed.stores)) {
      if (!snap?.catalog) continue;
      snapshots.set(id, {
        categories: Array.isArray(snap.categories) ? snap.categories : [],
        catalog: {
          items: Array.isArray(snap.catalog.items) ? snap.catalog.items : [],
          total: Number(snap.catalog.total) || 0,
        },
        savedAt: typeof snap.savedAt === "number" ? snap.savedAt : 0,
      });
      prefetchMenuImages((snap.catalog.items ?? []).map((it) => it.item_image_url));
    }
  } catch {
    /* ignore corrupt cache */
  }
}
