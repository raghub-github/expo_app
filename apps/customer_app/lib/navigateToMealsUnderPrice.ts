import type { Router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { getSyncFoodHomeLayoutFromQueryClient } from "@/lib/foodHomeLayoutCache";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { useLocationStore } from "@/store/locationStore";

/** Open meals-under-price — hero art warmed from layout cache before route push. */
export function navigateToMealsUnderPrice(router: Router, queryClient: QueryClient): void {
  const { address, coords } = useLocationStore.getState();
  const hints = extractCustomerGeoHints(address, coords);
  const layout = getSyncFoodHomeLayoutFromQueryClient(queryClient, hints);
  prefetchMealsUnder250HeroMedia(layout);

  requestAnimationFrame(() => {
    router.push("/home/meals-under-price");
  });
}
