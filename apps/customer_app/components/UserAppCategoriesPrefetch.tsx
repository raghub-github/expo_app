import { useEffect, useLayoutEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchUserAppCategories,
  seedUserAppCategoriesQueryIfCached,
} from "@/lib/userAppCategoryCache";

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
    for (const storeType of PREFETCH_STORE_TYPES) {
      void prefetchUserAppCategories(queryClient, storeType);
    }
  }, [queryClient]);

  return null;
}
