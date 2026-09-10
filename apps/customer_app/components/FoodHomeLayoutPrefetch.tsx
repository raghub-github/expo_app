import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchFoodHomeLayout,
  getSyncFoodHomeLayoutFromQueryClient,
  readSyncFoodHomeLayout,
  buildFoodHomeLayoutQueryKey,
} from "@/lib/foodHomeLayoutCache";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import {
  prefetchMerchantsList,
  readSyncMerchantsList,
  seedMerchantsListQueryIfCached,
  merchantsGeoBucket,
} from "@/lib/merchantsListCache";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import { prefetchGridFirstHeroMedia } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { prefetchMerchantCardImages } from "@/lib/imageEngine";
import { prefetchMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { seedFeaturedOffersHomeQueryIfCached } from "@/lib/featuredOffersHomeCache";
import { normalizeOfferLocationParams } from "@/lib/featuredOfferGeo";

/** Debounce only network refresh after lastKnown → reconcile — never block sync paint. */
const LOCATION_SETTLE_MS = 500;

/**
 * Warm food-home layout + nearby merchants AND their imagery as soon as location is
 * known — while the user is still on the Home tab, before they ever open Food.
 *
 * Categories are owned by UserAppCategoriesPrefetch (do not prefetch here).
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

  // Instant: sync layout + CTA/hero URLs from MMKV (no 500ms wait).
  useEffect(() => {
    if (!locationHydrated) return;
    const hints = extractCustomerGeoHints(address, coords);
    const sync =
      getSyncFoodHomeLayoutFromQueryClient(queryClient, hints) ?? readSyncFoodHomeLayout(hints);
    if (sync?.layoutKey) {
      queryClient.setQueryData(buildFoodHomeLayoutQueryKey(hints), (prev) => prev ?? sync);
      prefetchGridFirstHeroMedia(sync.gridFirstHeroMedia);
      prefetchMealsUnder250HeroMedia(sync);
    }
    seedFeaturedOffersHomeQueryIfCached(
      queryClient,
      normalizeOfferLocationParams({
        lat: coords?.latitude,
        lng: coords?.longitude,
        pincode: address?.pincode?.trim() || undefined,
        state: address?.state?.trim() || undefined,
        city: address?.city?.trim() || undefined,
      })
    );

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        await prefetchFoodHomeLayout(queryClient, address, coords);
        if (cancelled) return;
        const layout = getSyncFoodHomeLayoutFromQueryClient(queryClient, hints);
        if (layout) {
          prefetchGridFirstHeroMedia(layout.gridFirstHeroMedia);
          prefetchMealsUnder250HeroMedia(layout);
        }
      })();
    }, LOCATION_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    locationHydrated,
    coords?.latitude,
    coords?.longitude,
    address?.pincode,
    address?.state,
    address?.city,
    queryClient,
  ]);

  useEffect(() => {
    if (!locationHydrated || coords?.latitude == null || coords?.longitude == null) return;
    const lat = coords.latitude;
    const lng = coords.longitude;

    // Instant: seed RQ + decode card art from sync cache (no 500ms wait).
    seedMerchantsListQueryIfCached(queryClient, lat, lng, false);
    seedMerchantsListQueryIfCached(queryClient, lat, lng, true);
    seedMerchantsListQueryIfCached(queryClient, lat, lng, false, "GROCERY");
    const syncFood = readSyncMerchantsList(lat, lng, vegOnly) ?? readSyncMerchantsList(lat, lng, false);
    if (syncFood?.length) {
      prefetchMerchantCardImages(syncFood);
      prefetchMerchantBanners(syncFood);
    }
    const syncGrocery = readSyncMerchantsList(lat, lng, false, "GROCERY");
    if (syncGrocery?.length) {
      prefetchMerchantCardImages(syncGrocery);
      prefetchMerchantBanners(syncGrocery);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        await Promise.allSettled([
          prefetchMerchantsList(queryClient, lat, lng, false),
          prefetchMerchantsList(queryClient, lat, lng, true),
          prefetchMerchantsList(queryClient, lat, lng, false, "GROCERY"),
        ]);
        if (cancelled) return;
        const list = readSyncMerchantsList(lat, lng, vegOnly) ?? readSyncMerchantsList(lat, lng, false);
        if (list?.length) {
          prefetchMerchantCardImages(list);
          prefetchMerchantBanners(list);
        }
        const grocery = readSyncMerchantsList(lat, lng, false, "GROCERY");
        if (grocery?.length) {
          prefetchMerchantCardImages(grocery);
          prefetchMerchantBanners(grocery);
        }
      })();
    }, LOCATION_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locationHydrated, merchantsGeoKey, vegOnly, queryClient]);

  return null;
}
