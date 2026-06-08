import { Image } from "expo-image";
import type { UserAppCategoryItem } from "@/services/userAppCategory.service";
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

export function userAppCategoriesQueryKey(storeType: string) {
  return [USER_APP_CATEGORIES_QUERY_ROOT, storeType] as const;
}

const prefetchedImageUris = new Set<string>();

export function prefetchUserAppCategoryImages(categories: UserAppCategoryItem[]) {
  for (const cat of categories) {
    if (!cat.imageUrl?.trim()) continue;
    const uri = toAbsoluteImageUrl(cat.imageUrl) ?? cat.imageUrl;
    if (prefetchedImageUris.has(uri)) continue;
    prefetchedImageUris.add(uri);
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }
}
