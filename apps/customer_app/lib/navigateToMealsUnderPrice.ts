import type { Router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { getSyncFoodHomeLayoutFromQueryClient } from "@/lib/foodHomeLayoutCache";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { useLocationStore } from "@/store/locationStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { Image } from "expo-image";

export type MealsUnderPriceNavOpts = {
  tileId?: string | null;
  maxPrice?: number | null;
  heroImageUrl?: string | null;
  title?: string | null;
};

/** Open meals-under-price — hero art warmed from layout cache before route push. */
export function navigateToMealsUnderPrice(
  router: Router,
  queryClient: QueryClient,
  opts?: MealsUnderPriceNavOpts
): void {
  const { address, coords } = useLocationStore.getState();
  const hints = extractCustomerGeoHints(address, coords);
  const layout = getSyncFoodHomeLayoutFromQueryClient(queryClient, hints);
  prefetchMealsUnder250HeroMedia(layout);
  const hero = opts?.heroImageUrl?.trim();
  if (hero) {
    const uri = toAbsoluteImageUrl(hero) ?? hero;
    void Image.prefetch(uri, { cachePolicy: "memory-disk" });
  }

  const params: Record<string, string> = {};
  if (opts?.tileId) params.tileId = opts.tileId;
  if (opts?.maxPrice != null && opts.maxPrice > 0) params.maxPrice = String(Math.trunc(opts.maxPrice));
  if (opts?.title?.trim()) params.title = opts.title.trim().slice(0, 40);

  requestAnimationFrame(() => {
    if (Object.keys(params).length > 0) {
      router.push({ pathname: "/home/meals-under-price", params });
    } else {
      router.push("/home/meals-under-price");
    }
  });
}
