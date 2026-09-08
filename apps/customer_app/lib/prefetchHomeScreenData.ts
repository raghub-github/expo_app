import type { QueryClient } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/useWalletBalance";
import { walletService } from "@/services/wallet.service";
import {
  hydrateWalletBalanceQuery,
  writeWalletBalanceCache,
  walletBalanceFallback,
} from "@/lib/walletBalanceCache";
import { prefetchCriticalHomeAssetImagesSync } from "@/lib/homeCriticalAssets";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { getStoreBookmarks } from "@/services/merchant.service";
import { STORE_BOOKMARKS_QUERY_KEY } from "@/hooks/useStoreBookmarks";
import {
  hydrateStoreBookmarksFromStorage,
  readSyncStoreBookmarks,
  seedStoreBookmarksQuery,
  writeCachedStoreBookmarks,
} from "@/lib/storeBookmarkCache";

/**
 * Warm local caches + wallet/bookmarks before home paints.
 *
 * Location-keyed network (geo, offers, merchants, food layout, categories) is owned by
 * FeaturedOffersPrefetch / FoodHomeLayoutPrefetch / UserAppCategoriesPrefetch / Home hooks.
 * Fetching them here races lastKnown pin (e.g. 132106) before reconcile (132103) and
 * doubles every listing API.
 */
export async function prefetchHomeScreenData(queryClient: QueryClient): Promise<void> {
  await useLocationStore.getState().hydrate();
  await Promise.allSettled([
    hydrateStoreBookmarksFromStorage(),
    useFavoriteLocationsStore.getState().hydrate(),
    useRecentLocationStore.getState().hydrate(),
    useDietaryPreferenceStore.getState().hydrate(),
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
  ];

  if (coords) {
    tasks.push(restoreAndPrefetchLocationWeather(queryClient, address, coords));
  }

  await Promise.allSettled(tasks);
}
