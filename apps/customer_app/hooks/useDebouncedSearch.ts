/**
 * Real-time food/grocery catalog search – 150ms debounce, request cancel, location-scoped.
 * Distinguishes API failure vs empty results.
 */

import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { merchantService, type MerchantSummary } from "@/services/merchant.service";
import { SEARCH_CATEGORIES, type SearchCategory, type SearchDish } from "@/constants/search";

const DEBOUNCE_MS = 150;

export type SearchResults = {
  category: SearchCategory | null;
  dishes: SearchDish[];
  restaurants: MerchantSummary[];
  didYouMean?: string | null;
  correctedQuery?: string | null;
  searchInsteadOriginal?: string | null;
  preferStores?: boolean;
};

async function runSearch(
  query: string,
  opts: {
    signal?: AbortSignal;
    lat?: number;
    lng?: number;
    vegOnly?: boolean;
    storeType?: string;
  }
): Promise<SearchResults> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { category: null, dishes: [], restaurants: [] };
  }

  const category =
    SEARCH_CATEGORIES.find((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q.replace(/\s+/g, "-"))) ?? null;

  const res = await merchantService.search({
    q: query.trim(),
    limit: 30,
    offset: 0,
    lat: opts.lat,
    lng: opts.lng,
    vegOnly: opts.vegOnly,
    storeType: opts.storeType,
    signal: opts.signal,
  });

  if (res.error) {
    throw new Error(res.error);
  }

  const dishes: SearchDish[] = (res.dishes ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    imageKey: d.imageKey ?? "default",
    restaurantName: d.restaurantName,
    storeId: d.storeId,
  }));

  const restaurants: MerchantSummary[] = (res.stores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    imageUrl: s.imageUrl ?? undefined,
    displayImage: s.imageUrl ?? undefined,
    banner_url: s.imageUrl ?? undefined,
    cuisines: s.cuisines,
    distanceKm: s.distanceKm,
    storeType: (s as { storeType?: string | null }).storeType ?? undefined,
  }));

  return {
    category,
    dishes,
    restaurants,
    didYouMean: res.didYouMean ?? null,
    correctedQuery: res.correctedQuery ?? null,
    searchInsteadOriginal: res.searchInsteadOriginal ?? null,
    preferStores: res.preferStores === true,
  };
}

/** Returns debounced search results; empty query skips API. Cancels previous request. */
export function useDebouncedSearch(
  query: string,
  lat?: number,
  lng?: number,
  vegOnly?: boolean,
  storeType?: string
) {
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const enabled = debouncedQuery.length >= 1;
  const resolvedStoreType = (storeType ?? "FOOD").trim().toUpperCase() || "FOOD";

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["food-search", debouncedQuery, lat, lng, vegOnly === true, resolvedStoreType],
    queryFn: ({ signal }) =>
      runSearch(debouncedQuery, {
        signal,
        lat,
        lng,
        vegOnly,
        storeType: resolvedStoreType,
      }),
    enabled,
    staleTime: 5 * 1000,
    retry: 1,
  });

  return {
    results: enabled ? data ?? { category: null, dishes: [], restaurants: [] } : null,
    isLoading: enabled && (isLoading || isFetching),
    isError: enabled && isError,
    errorMessage: isError ? (error instanceof Error ? error.message : "Search failed") : null,
    refetch,
    debouncedQuery,
  };
}
