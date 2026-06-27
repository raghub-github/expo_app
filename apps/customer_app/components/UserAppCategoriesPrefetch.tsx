import { useEffect, useLayoutEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchUserAppCategories,
  seedUserAppCategoriesQueryIfCached,
} from "@/lib/userAppCategoryCache";

const FOOD_STORE_TYPE = "FOOD";

/** Warm category list + disk-cache icons at app start so home/search open instantly. */
export function UserAppCategoriesPrefetch() {
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    seedUserAppCategoriesQueryIfCached(queryClient, FOOD_STORE_TYPE);
  }, [queryClient]);

  useEffect(() => {
    void prefetchUserAppCategories(queryClient, FOOD_STORE_TYPE);
  }, [queryClient]);

  return null;
}
