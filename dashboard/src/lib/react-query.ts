import { QueryClient } from "@tanstack/react-query";
import { createPersister } from "./query-persistence";

/**
 * QueryClient configuration with optimal defaults for the dashboard
 * - Smart caching based on data volatility (see cache-strategies.ts)
 * - Persistence for static/medium data via localStorage
 * - Automatic cache invalidation on mutations
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes default
      gcTime: 10 * 60 * 1000, // 10 minutes default (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch if data is fresh
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Persister instance for localStorage persistence
 * Only persists Tier 1 (Static) and Tier 2 (Medium) data
 */
export const persister = createPersister();
