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
const prefetchedImageUris = new Set<string>();

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
      prefetchUserAppCategoryImages(entry.response.items, entry.response.allTab?.imageUrl);
    }
  }
}

void hydrateUserAppCategoriesMemoryFromStorage();

export async function writeCachedUserAppCategories(
  storeType: string,
  response: UserAppCategoriesResponse
): Promise<void> {
  const entry: CachedUserAppCategoriesEntry = { response, cachedAt: Date.now() };
  memoryByStoreType.set(storeType, entry);
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
  prefetchUserAppCategoryImages(cached.items, cached.allTab?.imageUrl);
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
  prefetchUserAppCategoryImages(entry.response.items, entry.response.allTab?.imageUrl);
  queryClient.setQueryData(userAppCategoriesQueryKey(storeType), entry.response);
  return entry.response;
}

export async function fetchUserAppCategoriesWithCache(
  storeType: string
): Promise<UserAppCategoriesResponse> {
  const response = await fetchUserAppCategories({ storeType });
  await writeCachedUserAppCategories(storeType, response);
  void prefetchUserAppCategoryImagesAwait(response.items, response.allTab?.imageUrl);
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
  if (allTabImageUrl?.trim()) {
    const allUri = toAbsoluteImageUrl(allTabImageUrl) ?? allTabImageUrl;
    if (!prefetchedImageUris.has(allUri)) {
      prefetchedImageUris.add(allUri);
      void Image.prefetch(allUri, { cachePolicy: "memory-disk" });
    }
  }
  for (const cat of categories) {
    if (!cat.imageUrl?.trim()) continue;
    const uri = toAbsoluteImageUrl(cat.imageUrl) ?? cat.imageUrl;
    if (prefetchedImageUris.has(uri)) continue;
    prefetchedImageUris.add(uri);
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }
}

export async function prefetchUserAppCategoryImagesAwait(
  categories: UserAppCategoryItem[],
  allTabImageUrl?: string | null
): Promise<void> {
  const uris: string[] = [];
  if (allTabImageUrl?.trim()) {
    const allUri = toAbsoluteImageUrl(allTabImageUrl) ?? allTabImageUrl;
    if (!prefetchedImageUris.has(allUri)) {
      prefetchedImageUris.add(allUri);
      uris.push(allUri);
    }
  }
  for (const cat of categories) {
    if (!cat.imageUrl?.trim()) continue;
    const uri = toAbsoluteImageUrl(cat.imageUrl) ?? cat.imageUrl;
    if (prefetchedImageUris.has(uri)) continue;
    prefetchedImageUris.add(uri);
    uris.push(uri);
  }
  if (uris.length === 0) return;
  await Promise.all(
    uris.map((uri) =>
      Image.prefetch(uri, { cachePolicy: "memory-disk" }).catch(() => undefined)
    )
  );
}
