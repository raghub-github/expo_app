import { Image } from "expo-image";
import type { QueryClient } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import {
  featuredOffersHomeQueryKey,
  prefetchFeaturedOffersHome,
} from "@/hooks/useFeaturedOffersHome";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/useWalletBalance";
import { walletService } from "@/services/wallet.service";
import {
  hydrateWalletBalanceQuery,
  writeWalletBalanceCache,
  walletBalanceFallback,
} from "@/lib/walletBalanceCache";
import { prefetchFoodHomeLayout } from "@/lib/foodHomeLayoutCache";
import { prefetchUserAppCategories } from "@/lib/userAppCategoryCache";
import { prefetchFeaturedOfferHeroImages } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMerchantsList } from "@/lib/merchantsListCache";
import { prefetchCriticalHomeAssetImagesSync } from "@/lib/homeCriticalAssets";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { getGeoServiceAvailability } from "@/services/geoServices.service";
import { getStoreBookmarks } from "@/services/merchant.service";
import { STORE_BOOKMARKS_QUERY_KEY } from "@/hooks/useStoreBookmarks";
import { geoServicesQueryKey } from "@/hooks/useGeoServiceAvailability";
import {
  hydrateStoreBookmarksFromStorage,
  readSyncStoreBookmarks,
  seedStoreBookmarksQuery,
  writeCachedStoreBookmarks,
} from "@/lib/storeBookmarkCache";

const FOOD_HOME_CATEGORY_STORE_TYPE = "FOOD";

async function prefetchGeoServices(queryClient: QueryClient): Promise<void> {
  const { coords, address } = useLocationStore.getState();
  const pincode = address?.pincode?.trim() || null;
  const state = address?.state?.trim() || null;
  const lat = coords?.latitude ?? null;
  const lng = coords?.longitude ?? null;
  if (!pincode && !state && (lat == null || lng == null)) return;

  await queryClient.prefetchQuery({
    queryKey: geoServicesQueryKey({ pincode, state, lat, lng }),
    queryFn: async () => {
      const result = await getGeoServiceAvailability({
        ...(pincode ? { pincode } : {}),
        ...(state ? { state } : {}),
        ...(lat != null && lng != null ? { lat, lng } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.availability;
    },
    staleTime: 10_000,
  });
}

async function prefetchOfferBannerImages(queryClient: QueryClient): Promise<void> {
  const { coords, address } = useLocationStore.getState();
  const params = {
    lat: coords?.latitude,
    lng: coords?.longitude,
    pincode: address?.pincode?.trim() || undefined,
    state: address?.state?.trim() || undefined,
    city: address?.city?.trim() || undefined,
  };
  await prefetchFeaturedOffersHome(queryClient, params);
  const cached = queryClient.getQueryData<{ offers?: Array<{ offer_image_url?: string | null; kind?: string }> }>(
    featuredOffersHomeQueryKey(params)
  );
  prefetchFeaturedOfferHeroImages(cached?.offers as never);
  const uris = (cached?.offers ?? [])
    .map((offer) => offer.offer_image_url?.trim())
    .filter(Boolean)
    .map((url) => toAbsoluteImageUrl(url!) ?? url!);
  await Promise.allSettled(
    uris.map((uri) => Image.prefetch(uri, { cachePolicy: "memory-disk" }))
  );
}

/** Warm wallet, weather, offers, and promo art before home paints. */
export async function prefetchHomeScreenData(queryClient: QueryClient): Promise<void> {
  await useLocationStore.getState().hydrate();
  await Promise.allSettled([
    hydrateStoreBookmarksFromStorage(),
    useFavoriteLocationsStore.getState().hydrate(),
    useRecentLocationStore.getState().hydrate(),
  ]);
  seedStoreBookmarksQuery(queryClient);
  prefetchCriticalHomeAssetImagesSync(useAppAssetsStore.getState().assets);
  const { coords, address } = useLocationStore.getState();

  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery({
      queryKey: STORE_BOOKMARKS_QUERY_KEY,
      queryFn: async () => {
        const remote = await getStoreBookmarks();
        const ids = remote.length > 0 ? remote : (readSyncStoreBookmarks() ?? []);
        void writeCachedStoreBookmarks(ids);
        return ids;
      },
      staleTime: 60 * 1000,
    }),
    hydrateWalletBalanceQuery(queryClient).then(() =>
      queryClient.prefetchQuery({
        queryKey: WALLET_BALANCE_QUERY_KEY,
        queryFn: async () => {
          try {
            const data = await walletService.getBalance();
            void writeWalletBalanceCache(data);
            return data;
          } catch {
            return walletBalanceFallback();
          }
        },
        staleTime: 60_000,
      })
    ),
    prefetchOfferBannerImages(queryClient),
    prefetchFoodHomeLayout(queryClient, address, coords),
    prefetchUserAppCategories(queryClient, FOOD_HOME_CATEGORY_STORE_TYPE),
    prefetchGeoServices(queryClient),
  ];

  if (coords) {
    tasks.push(restoreAndPrefetchLocationWeather(queryClient, address, coords));
    const vegOnly = useDietaryPreferenceStore.getState().vegOnly;
    tasks.push(prefetchMerchantsList(queryClient, coords.latitude, coords.longitude, vegOnly));
  }

  await Promise.allSettled(tasks);
}
