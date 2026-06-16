import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchUserAppCategories } from "@/services/userAppCategory.service";
import {
  prefetchUserAppCategoryImages,
  USER_APP_CATEGORIES_QUERY_OPTIONS,
  userAppCategoriesQueryKey,
} from "@/lib/userAppCategoryCache";

const FOOD_STORE_TYPE = "FOOD";

/** Warm category list + disk-cache icons at app start so home/search open instantly. */
export function UserAppCategoriesPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    void (async () => {
      const queryKey = userAppCategoriesQueryKey(FOOD_STORE_TYPE);
      try {
        const items = await queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetchUserAppCategories({ storeType: FOOD_STORE_TYPE }),
          ...USER_APP_CATEGORIES_QUERY_OPTIONS,
        });
        prefetchUserAppCategoryImages(items);
      } catch {
        // Non-blocking — screens still fetch on demand.
      }
    })();
  }, [queryClient]);

  return null;
}
