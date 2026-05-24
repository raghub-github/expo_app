/**
 * Real-time food search – 150ms debounce, request cancel, location-scoped.
 * Never throws: returns empty results on error. Used by full-screen search.
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
};

async function runSearch(
  query: string,
  opts: { signal?: AbortSignal; lat?: number; lng?: number }
): Promise<SearchResults> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { category: null, dishes: [], restaurants: [] };
  }

  const category =
    SEARCH_CATEGORIES.find((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q.replace(/\s+/g, "-"))) ?? null;

  const { dishes: apiDishes, stores: apiStores } = await merchantService.search({
    q: query.trim(),
    limit: 30,
    lat: opts.lat,
    lng: opts.lng,
    signal: opts.signal,
  });

  const dishes: SearchDish[] = (apiDishes ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    imageKey: d.imageKey ?? "default",
    restaurantName: d.restaurantName,
    storeId: d.storeId,
  }));

  const restaurants: MerchantSummary[] = (apiStores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    imageUrl: s.imageUrl ?? undefined,
    cuisines: s.cuisines,
  }));

  return { category, dishes, restaurants };
}

/** Returns debounced search results; empty query skips API. Cancels previous request. */
export function useDebouncedSearch(query: string, lat?: number, lng?: number) {
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const enabled = debouncedQuery.length >= 1;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["food-search", debouncedQuery, lat, lng],
    queryFn: ({ signal }) => runSearch(debouncedQuery, { signal, lat, lng }),
    enabled,
    staleTime: 5 * 1000,
  });

  return {
    results: enabled ? data ?? { category: null, dishes: [], restaurants: [] } : null,
    isLoading: enabled && (isLoading || isFetching),
    debouncedQuery,
  };
}

