import { QueryClient } from "@tanstack/react-query";
import { createPersister } from "./query-persistence";

/**
 * QueryClient configuration with optimal defaults for smooth loading and updates:
 * - Keep previous data visible while refetching (no flash of empty state)
 * - Smart caching and persistence (see cache-strategies.ts)
 * - 10 minute stale window so cached dashboard data is reused on navigation
 * - 30 minute cache window so inactive tabs can resume instantly
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes default
      gcTime: 30 * 60 * 1000, // 30 minutes default (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      // Keep previous data visible during refetch for smooth, non-jarring updates
      placeholderData: (previousData: unknown) => previousData,      retry: 1,
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
