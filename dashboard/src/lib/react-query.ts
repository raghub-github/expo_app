import { QueryClient } from "@tanstack/react-query";
import { createPersister } from "./query-persistence";

/**
 * QueryClient configuration with optimal defaults for smooth loading and updates:
 * - Keep previous data visible while refetching (no flash of empty state)
 * - Smart caching and persistence (see cache-strategies.ts)
 * - Refetch on reconnect so data stays fresh after network restore
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes default
      gcTime: 10 * 60 * 1000, // 10 minutes default (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
      // Keep previous data visible during refetch for smooth, non-jarring updates
      placeholderData: (previousData) => previousData,
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
