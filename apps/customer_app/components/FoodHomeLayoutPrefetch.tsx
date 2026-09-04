import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchFoodHomeLayout,
  getSyncFoodHomeLayoutFromQueryClient,
} from "@/lib/foodHomeLayoutCache";
import { prefetchUserAppCategories } from "@/lib/userAppCategoryCache";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { prefetchMerchantsList, readSyncMerchantsList, merchantsGeoBucket } from "@/lib/merchantsListCache";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { prefetchGridFirstHeroMedia } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";
import { prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";

/**
 * Warm food-home layout + nearby merchants AND their imagery as soon as location is
 * known — while the user is still on the Home tab, before they ever open Food.
 *
 * Data alone is not enough for "instant visual readiness": if the hero/card images are
 * only prefetched once the Food screen mounts, the first paint still waits on a download
 * + decode. So after each data prefetch resolves we also decode the images into the
 * memory/disk cache here. Every prefetch helper dedupes by URI, so warming early cannot
 * cause a double download — it only moves the fetch off the first-paint critical path.
 */
export function FoodHomeLayoutPrefetch() {
  const queryClient = useQueryClient();
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);
  const merchantsGeoKey =
    coords?.latitude != null && coords?.longitude != null
      ? merchantsGeoBucket(coords.latitude, coords.longitude)
      : null;

  useEffect(() => {
    if (!locationHydrated) return;
    let cancelled = false;
    void (async () => {
      await prefetchFoodHomeLayout(queryClient, address, coords);
      if (cancelled) return;
      // Decode the FRESHEST hero media (post-network) into cache now, not on-screen —
      // hydrateFoodHomeLayoutForHints only warmed the disk-cached media pre-fetch.
      const hints = extractCustomerGeoHints(address, coords);
      const layout = getSyncFoodHomeLayoutFromQueryClient(queryClient, hints);
      if (layout) {
        prefetchGridFirstHeroMedia(layout.gridFirstHeroMedia);
        prefetchMealsUnder250HeroMedia(layout);
      }
    })();
    void prefetchUserAppCategories(queryClient, "FOOD");
    return () => {
      cancelled = true;
    };
  }, [
    locationHydrated,
    coords?.latitude,
    coords?.longitude,
    address?.pincode,
    address?.state,
    queryClient,
  ]);

  useEffect(() => {
    if (!locationHydrated || coords?.latitude == null || coords?.longitude == null) return;
    const lat = coords.latitude;
    const lng = coords.longitude;
    let cancelled = false;
    void (async () => {
      await prefetchMerchantsList(queryClient, lat, lng, vegOnly);
      if (cancelled) return;
      const list = readSyncMerchantsList(lat, lng, vegOnly);
      if (list?.length) {
        // Warms restaurant card images AND the hero fallback (merchant banners are used
        // as the hero when admin has no grid-first media) — both ready before navigation.
        prefetchMerchantCardImages(list);
        prefetchMerchantBanners(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationHydrated, merchantsGeoKey, vegOnly, queryClient]);

  // Grocery list + card banners — warm while still on Home, before Grocery opens.
  useEffect(() => {
    if (!locationHydrated || coords?.latitude == null || coords?.longitude == null) return;
    const lat = coords.latitude;
    const lng = coords.longitude;
    let cancelled = false;
    void (async () => {
      await prefetchMerchantsList(queryClient, lat, lng, false, "GROCERY");
      if (cancelled) return;
      const list = readSyncMerchantsList(lat, lng, false, "GROCERY");
      if (list?.length) {
        prefetchMerchantCardImages(list);
        prefetchMerchantBanners(list);
      }
    })();
    void prefetchUserAppCategories(queryClient, "GROCERY");
    return () => {
      cancelled = true;
    };
  }, [locationHydrated, merchantsGeoKey, queryClient]);

  return null;
}
