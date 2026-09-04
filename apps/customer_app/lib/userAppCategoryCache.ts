import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import {
  fetchUserAppCategories,
  type UserAppCategoryItem,
  type UserAppCategoriesResponse,
} from "@/services/userAppCategory.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { rememberCategoryImageLastGood } from "@/lib/categoryImageLastGood";

export const USER_APP_CATEGORIES_QUERY_ROOT = "userAppCategories";

/** Categories are fixed — keep API + image cache warm for a long time. */
export const USER_APP_CATEGORIES_STALE_MS = 24 * 60 * 60 * 1000;
export const USER_APP_CATEGORIES_GC_MS = 7 * 24 * 60 * 60 * 1000;

export const USER_APP_CATEGORIES_QUERY_OPTIONS = {
  staleTime: USER_APP_CATEGORIES_STALE_MS,
  gcTime: USER_APP_CATEGORIES_GC_MS,
  retry: 1,
} as const;

type CachedUserAppCategoriesEntry = {
  response: UserAppCategoriesResponse;
  cachedAt: number;
};

type UserAppCategoriesCacheBlob = Record<string, CachedUserAppCategoriesEntry>;

const memoryByStoreType = new Map<string, CachedUserAppCategoriesEntry>();
/** URIs that successfully landed in expo-image memory/disk cache. */
const prefetchedImageUris = new Set<string>();
/** In-flight prefetch promises so callers can await without double-fetch. */
const prefetchInFlight = new Map<string, Promise<boolean>>();

const PREFETCH_CONCURRENCY = 10;
/** Warm every visible chip (All + under-price + full rail) before paint when possible. */
export const VISIBLE_CATEGORY_IMAGE_PREFETCH_COUNT = 24;

async function prefetchOneUri(uri: string): Promise<boolean> {
  if (prefetchedImageUris.has(uri)) return true;
  const existing = prefetchInFlight.get(uri);
  if (existing) return existing;

  const task = Image.prefetch(uri, { cachePolicy: "memory-disk" })
    .then(() => {
      prefetchedImageUris.add(uri);
      markHeroMediaSessionReady(uri);
      prefetchInFlight.delete(uri);
      return true;
    })
    .catch(() => {
      prefetchInFlight.delete(uri);
      return false;
    });
  prefetchInFlight.set(uri, task);
  return task;
}

function collectCategoryImageUris(
  categories: UserAppCategoryItem[],
  allTabImageUrl?: string | null,
  limit?: number
): string[] {
  const uris: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw?.trim()) return;
    const uri = toAbsoluteImageUrl(raw) ?? raw;
    if (!uri || uris.includes(uri)) return;
    uris.push(uri);
  };
  push(allTabImageUrl);
  for (const cat of categories) {
    push(cat.imageUrl);
    if (limit != null && uris.length >= limit) break;
  }
  return uris;
}

async function prefetchUrisWithConcurrency(uris: string[]): Promise<void> {
  const pending = uris.filter((u) => !prefetchedImageUris.has(u));
  if (pending.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(PREFETCH_CONCURRENCY, pending.length) }, async () => {
    while (cursor < pending.length) {
      const i = cursor++;
      await prefetchOneUri(pending[i]!);
    }
  });
  await Promise.all(workers);
}

export function userAppCategoriesQueryKey(storeType: string) {
  return [USER_APP_CATEGORIES_QUERY_ROOT, storeType] as const;
}

export function readSyncUserAppCategories(storeType: string): UserAppCategoriesResponse | undefined {
  const response = memoryByStoreType.get(storeType)?.response;
  return response?.items?.length ? response : response?.allTab?.imageUrl ? response : undefined;
}

export function getUserAppCategoriesCachedAt(storeType: string): number | undefined {
  return memoryByStoreType.get(storeType)?.cachedAt;
}

async function readPersistedBlob(): Promise<UserAppCategoriesCacheBlob> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_APP_CATEGORIES_CACHE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UserAppCategoriesCacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePersistedBlob(blob: UserAppCategoriesCacheBlob): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_APP_CATEGORIES_CACHE, JSON.stringify(blob));
  } catch {
    // Non-blocking — in-memory + React Query still work.
  }
}

/** Warm in-memory cache from disk as early as possible (before first home paint). */
export async function hydrateUserAppCategoriesMemoryFromStorage(): Promise<void> {
  const blob = await readPersistedBlob();
  for (const [storeType, entry] of Object.entries(blob)) {
    if (entry?.response?.items?.length || entry?.response?.allTab) {
      memoryByStoreType.set(storeType, entry);
      if (entry.response.allTab?.imageUrl) {
        rememberCategoryImageLastGood("tab-category-all", entry.response.allTab.imageUrl);
      }
      for (const item of entry.response.items ?? []) {
        if (item.imageUrl) {
          rememberCategoryImageLastGood(`tab-category-${item.id}`, item.imageUrl);
        }
      }
      void prefetchUserAppCategoryImagesAwait(
        entry.response.items,
        entry.response.allTab?.imageUrl
      );
    }
  }
}

void hydrateUserAppCategoriesMemoryFromStorage();

export async function writeCachedUserAppCategories(
  storeType: string,
  response: UserAppCategoriesResponse
): Promise<void> {
  // Preserve All-tab artwork when a refresh briefly omits imageUrl.
  const prev = memoryByStoreType.get(storeType)?.response;
  const mergedAllTab = {
    label: response.allTab?.label?.trim() || prev?.allTab?.label || "All",
    imageUrl:
      response.allTab?.imageUrl?.trim() ||
      prev?.allTab?.imageUrl?.trim() ||
      null,
  };
  const mergedItems = response.items.map((item) => {
    const prior = prev?.items?.find((p) => p.id === item.id);
    return {
      ...item,
      imageUrl: item.imageUrl?.trim() || prior?.imageUrl?.trim() || null,
    };
  });
  const merged: UserAppCategoriesResponse = {
    ...response,
    allTab: mergedAllTab,
    items: mergedItems,
  };

  if (mergedAllTab.imageUrl) {
    rememberCategoryImageLastGood("tab-category-all", mergedAllTab.imageUrl);
  }
  for (const item of mergedItems) {
    if (item.imageUrl) {
      rememberCategoryImageLastGood(`tab-category-${item.id}`, item.imageUrl);
    }
  }

  const entry: CachedUserAppCategoriesEntry = { response: merged, cachedAt: Date.now() };
  memoryByStoreType.set(storeType, entry);
  // Do not persist an empty rail — Super Admin may add GROCERY/FOOD tiles next,
  // and a 24h disk cache of [] would hide them.
  if (!merged.items.length) return;
  const blob = await readPersistedBlob();
  blob[storeType] = entry;
  await writePersistedBlob(blob);
}

export function seedUserAppCategoriesQueryIfCached(
  queryClient: QueryClient,
  storeType: string
): boolean {
  const queryKey = userAppCategoriesQueryKey(storeType);
  if (queryClient.getQueryData<UserAppCategoriesResponse>(queryKey)?.items?.length) return true;

  const cached = readSyncUserAppCategories(storeType);
  if (!cached) return false;

  queryClient.setQueryData(queryKey, cached);
  void prefetchUserAppCategoryImagesAwait(cached.items, cached.allTab?.imageUrl);
  return true;
}

export async function hydrateUserAppCategoriesQuery(
  queryClient: QueryClient,
  storeType: string
): Promise<UserAppCategoriesResponse | undefined> {
  if (seedUserAppCategoriesQueryIfCached(queryClient, storeType)) {
    return queryClient.getQueryData<UserAppCategoriesResponse>(userAppCategoriesQueryKey(storeType));
  }

  await hydrateUserAppCategoriesMemoryFromStorage();
  if (seedUserAppCategoriesQueryIfCached(queryClient, storeType)) {
    return queryClient.getQueryData<UserAppCategoriesResponse>(userAppCategoriesQueryKey(storeType));
  }

  const blob = await readPersistedBlob();
  const entry = blob[storeType];
  if (!entry?.response) return undefined;

  memoryByStoreType.set(storeType, entry);
  void prefetchUserAppCategoryImagesAwait(entry.response.items, entry.response.allTab?.imageUrl);
  queryClient.setQueryData(userAppCategoriesQueryKey(storeType), entry.response);
  return entry.response;
}

export async function fetchUserAppCategoriesWithCache(
  storeType: string
): Promise<UserAppCategoriesResponse> {
  const response = await fetchUserAppCategories({ storeType });
  await writeCachedUserAppCategories(storeType, response);
  await prefetchUserAppCategoryImagesAwait(response.items, response.allTab?.imageUrl, {
    visibleFirst: VISIBLE_CATEGORY_IMAGE_PREFETCH_COUNT,
  });
  return response;
}

export async function prefetchUserAppCategories(
  queryClient: QueryClient,
  storeType: string
): Promise<void> {
  await hydrateUserAppCategoriesQuery(queryClient, storeType);
  await queryClient.prefetchQuery({
    queryKey: userAppCategoriesQueryKey(storeType),
    queryFn: () => fetchUserAppCategoriesWithCache(storeType),
    ...USER_APP_CATEGORIES_QUERY_OPTIONS,
  });
}

export function prefetchUserAppCategoryImages(
  categories: UserAppCategoryItem[],
  allTabImageUrl?: string | null
) {
  const uris = collectCategoryImageUris(categories, allTabImageUrl);
  void prefetchUrisWithConcurrency(uris);
}

/** Prefer this on home: warm the first visible chips before the rest. */
export async function prefetchUserAppCategoryImagesAwait(
  categories: UserAppCategoryItem[],
  allTabImageUrl?: string | null,
  options?: { visibleFirst?: number }
): Promise<void> {
  const visibleFirst = options?.visibleFirst ?? VISIBLE_CATEGORY_IMAGE_PREFETCH_COUNT;
  const visible = collectCategoryImageUris(categories, allTabImageUrl, visibleFirst);
  await prefetchUrisWithConcurrency(visible);
  const rest = collectCategoryImageUris(categories, allTabImageUrl).filter(
    (u) => !visible.includes(u)
  );
  void prefetchUrisWithConcurrency(rest);
}
