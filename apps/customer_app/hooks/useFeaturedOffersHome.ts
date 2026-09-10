import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  featuredOffersHomeQueryKey,
  featuredOffersHomeQueryOptions,
  prefetchFeaturedOffersHomeCached,
  readSyncFeaturedOffersHome,
  getFeaturedOffersHomeCachedAt,
  type FeaturedOffersHomeParams,
} from "@/lib/featuredOffersHomeCache";

export type { FeaturedOffersHomeParams };
export {
  featuredOffersHomeQueryKey,
  featuredOffersHomeQueryOptions,
  readSyncFeaturedOffersHome,
  getFeaturedOffersHomeCachedAt,
};

export function prefetchFeaturedOffersHome(
  queryClient: QueryClient,
  params: FeaturedOffersHomeParams
) {
  return prefetchFeaturedOffersHomeCached(queryClient, params);
}

export function useFeaturedOffersHome(
  params: FeaturedOffersHomeParams,
  enabled: boolean
) {
  const initial = enabled ? readSyncFeaturedOffersHome(params) : undefined;
  return useQuery({
    ...featuredOffersHomeQueryOptions(params),
    enabled,
    initialData: initial,
    initialDataUpdatedAt: initial ? getFeaturedOffersHomeCachedAt(params) ?? Date.now() : undefined,
    placeholderData: (prev) => prev,
  });
}
