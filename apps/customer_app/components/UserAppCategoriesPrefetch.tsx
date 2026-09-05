import { useEffect, useLayoutEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  hydrateUserAppCategoriesMemoryFromStorage,
  prefetchUserAppCategories,
  seedUserAppCategoriesQueryIfCached,
} from "@/lib/userAppCategoryCache";
import { hydrateCategoryImageLastGood } from "@/lib/categoryImageLastGood";
import { hydrateCategoryImageFileCache } from "@/lib/categoryImageFileCache";

const PREFETCH_STORE_TYPES = ["FOOD", "GROCERY"] as const;

/** Warm category list + disk-cache icons at app start so home/search open instantly. */
export function UserAppCategoriesPrefetch() {
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    for (const storeType of PREFETCH_STORE_TYPES) {
      seedUserAppCategoriesQueryIfCached(queryClient, storeType);
    }
  }, [queryClient]);

  useEffect(() => {
    void (async () => {
      // Expo Go: pull AsyncStorage into memory before network refresh.
      await Promise.all([
        hydrateCategoryImageLastGood(),
        hydrateCategoryImageFileCache(),
        hydrateUserAppCategoriesMemoryFromStorage(),
      ]);
      for (const storeType of PREFETCH_STORE_TYPES) {
        seedUserAppCategoriesQueryIfCached(queryClient, storeType);
        void prefetchUserAppCategories(queryClient, storeType);
      }
    })();
  }, [queryClient]);

  return null;
}
