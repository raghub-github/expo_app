import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import {
  merchantService,
  type MerchantDetail,
} from "@/services/merchant.service";
import { prefetchMenuItemImagesForMenu } from "@/lib/prefetchMenuItemImages";

/** Version-based SWR — no time-based expiry. */
export const MERCHANT_DETAIL_STALE_MS = Number.POSITIVE_INFINITY;
export const MERCHANT_DETAIL_GC_MS = 7 * 24 * 60 * 60 * 1000;

export const MERCHANT_DETAIL_QUERY_KEY = (merchantId: string) =>
  ["merchant", merchantId] as const;

type CachedMerchantMenuEntry = {
  detail: MerchantDetail;
  cachedAt: number;
};

type MerchantMenuCacheBlob = Record<string, CachedMerchantMenuEntry>;

const MAX_CACHED_STORES = 15;
const memoryByStoreId = new Map<string, CachedMerchantMenuEntry>();

export function hasMemoryMerchantMenu(merchantId: string): boolean {
  return (memoryByStoreId.get(merchantId)?.detail?.menu?.length ?? 0) > 0;
}

export function readSyncMerchantMenu(merchantId: string): MerchantDetail | undefined {
  return memoryByStoreId.get(merchantId)?.detail;
}

export function getMerchantMenuCachedAt(merchantId: string): number | undefined {
  return memoryByStoreId.get(merchantId)?.cachedAt;
}

async function readPersistedBlob(): Promise<MerchantMenuCacheBlob> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MERCHANT_MENU_CACHE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MerchantMenuCacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePersistedBlob(blob: MerchantMenuCacheBlob): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MERCHANT_MENU_CACHE, JSON.stringify(blob));
  } catch {
    // Non-blocking — in-memory + React Query still work.
  }
}

function trimBlobToMaxStores(blob: MerchantMenuCacheBlob): MerchantMenuCacheBlob {
  const entries = Object.entries(blob).sort((a, b) => b[1].cachedAt - a[1].cachedAt);
  if (entries.length <= MAX_CACHED_STORES) return blob;
  return Object.fromEntries(entries.slice(0, MAX_CACHED_STORES));
}

function rememberInMemory(merchantId: string, detail: MerchantDetail): void {
  memoryByStoreId.set(merchantId, { detail, cachedAt: Date.now() });
}

/** Warm in-memory store menus from disk at app launch (disk only when memory empty). */
export async function hydrateMerchantMenuMemoryFromStorage(): Promise<void> {
  const blob = await readPersistedBlob();
  for (const [storeId, entry] of Object.entries(blob)) {
    if (!entry?.detail || memoryByStoreId.has(storeId)) continue;
    memoryByStoreId.set(storeId, entry);
    if (entry.detail.menu?.length) {
      void prefetchMenuItemImagesForMenu(entry.detail.menu);
    }
  }
}

void hydrateMerchantMenuMemoryFromStorage();

export async function writeCachedMerchantMenu(
  merchantId: string,
  detail: MerchantDetail
): Promise<void> {
  rememberInMemory(merchantId, detail);

  const blob = await readPersistedBlob();
  blob[merchantId] = { detail, cachedAt: Date.now() };
  await writePersistedBlob(trimBlobToMaxStores(blob));
}

export async function updateCachedMerchantMenu(
  merchantId: string,
  detail: MerchantDetail
): Promise<void> {
  await writeCachedMerchantMenu(merchantId, detail);
}

export function seedMerchantMenuQueryIfCached(
  queryClient: QueryClient,
  merchantId: string
): boolean {
  const queryKey = MERCHANT_DETAIL_QUERY_KEY(merchantId);
  const existing = queryClient.getQueryData<MerchantDetail>(queryKey);
  if (existing?.menu?.length) return true;

  const cached = readSyncMerchantMenu(merchantId);
  if (!cached?.menu?.length) return false;

  queryClient.setQueryData(queryKey, cached);
  void prefetchMenuItemImagesForMenu(cached.menu);
  return true;
}

/** Disk fallback — only when memory miss. */
export async function hydrateMerchantMenuQuery(
  queryClient: QueryClient,
  merchantId: string
): Promise<MerchantDetail | undefined> {
  if (seedMerchantMenuQueryIfCached(queryClient, merchantId)) {
    return queryClient.getQueryData<MerchantDetail>(MERCHANT_DETAIL_QUERY_KEY(merchantId));
  }

  if (memoryByStoreId.has(merchantId)) {
    return readSyncMerchantMenu(merchantId);
  }

  await hydrateMerchantMenuMemoryFromStorage();
  if (seedMerchantMenuQueryIfCached(queryClient, merchantId)) {
    return queryClient.getQueryData<MerchantDetail>(MERCHANT_DETAIL_QUERY_KEY(merchantId));
  }

  const blob = await readPersistedBlob();
  const entry = blob[merchantId];
  if (!entry?.detail) return undefined;

  memoryByStoreId.set(merchantId, entry);
  queryClient.setQueryData(MERCHANT_DETAIL_QUERY_KEY(merchantId), entry.detail);
  if (entry.detail.menu?.length) {
    void prefetchMenuItemImagesForMenu(entry.detail.menu);
  }
  return entry.detail;
}

export async function fetchMerchantByIdWithCache(
  merchantId: string,
  searchInMenu?: string
): Promise<MerchantDetail> {
  const detail = await merchantService.getMerchantById(merchantId, searchInMenu);
  if (!detail) {
    const cached = readSyncMerchantMenu(merchantId);
    if (cached) return cached;
    throw new Error("Merchant menu unavailable");
  }
  if (!searchInMenu?.trim()) {
    await writeCachedMerchantMenu(merchantId, detail);
    void prefetchMenuItemImagesForMenu(detail.menu ?? []);
  }
  return detail;
}
