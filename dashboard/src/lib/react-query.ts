import { QueryClient } from "@tanstack/react-query";
import { createPersister } from "./query-persistence";

const QUERY_CLIENT_OPTIONS = {
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes default
      gcTime: 30 * 60 * 1000, // 30 minutes default (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      placeholderData: (previousData: unknown) => previousData,
      retry: 1,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
} as const;

declare global {
  interface Window {
    __GATI_QUERY_CLIENT__?: QueryClient;
  }
}

function createQueryClient(): QueryClient {
  return new QueryClient(QUERY_CLIENT_OPTIONS);
}

/**
 * QueryClient configuration with optimal defaults for smooth loading and updates.
 * In the browser we reuse a window singleton so dev HMR / multi-tab work does not
 * wipe in-memory caches and trigger full dashboard reloads.
 */
export const queryClient =
  typeof window !== "undefined"
    ? (window.__GATI_QUERY_CLIENT__ ??= createQueryClient())
    : createQueryClient();

/**
 * Persister instance for localStorage persistence
 * Only persists Tier 1 (Static) and Tier 2 (Medium) data
 */
export const persister = createPersister();
