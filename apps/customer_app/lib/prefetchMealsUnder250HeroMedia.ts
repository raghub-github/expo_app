import { Image } from "expo-image";
import type { FoodHomeLayoutResult } from "@/services/foodHomeLayout.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const prefetched = new Set<string>();

function prefetchUri(raw: string | null | undefined): void {
  const trimmed = raw?.trim();
  if (!trimmed) return;
  const uri = toAbsoluteImageUrl(trimmed) ?? trimmed;
  if (prefetched.has(uri)) return;
  prefetched.add(uri);
  void Image.prefetch(uri, { cachePolicy: "memory-disk" });
}

/** Warm under-₹250 tab + hero art before the inner page paints. */
export function prefetchMealsUnder250HeroMedia(
  layout: Pick<
    FoodHomeLayoutResult,
    | "gridFirstUnder250HeroImageUrl"
    | "gridFirstUnder250TabImageUrl"
    | "discoveryDealsAtHeroImageUrl"
    | "discoveryDealsAtImageUrl"
    | "discoveryCrazyDealsImageUrl"
    | "discoveryFreePackagingImageUrl"
    | "discoveryCtaTiles"
  > | null | undefined
): void {
  if (!layout) return;
  prefetchUri(layout.gridFirstUnder250HeroImageUrl);
  prefetchUri(layout.gridFirstUnder250TabImageUrl);
  prefetchUri(layout.discoveryDealsAtHeroImageUrl);
  prefetchUri(layout.discoveryDealsAtImageUrl);
  prefetchUri(layout.discoveryCrazyDealsImageUrl);
  prefetchUri(layout.discoveryFreePackagingImageUrl);
  for (const tile of layout.discoveryCtaTiles ?? []) {
    prefetchUri(tile.imageUrl);
    prefetchUri(tile.heroImageUrl);
  }
}
