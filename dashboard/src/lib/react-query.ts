import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createPersister } from "./query-persistence";
import {
  isSessionExpiredApiError,
  redirectToLoginOnSessionExpired,
} from "@/lib/auth/redirect-to-login";

function handleQueryAuthError(error: unknown) {
  if (typeof window === "undefined") return;
  if (isSessionExpiredApiError(error)) {
    redirectToLoginOnSessionExpired({ reason: "query_unauthorized" });
  }
}

const QUERY_CLIENT_OPTIONS = {
  queryCache: new QueryCache({
    onError: (error) => handleQueryAuthError(error),
  }),
  mutationCache: new MutationCache({
    onError: (error) => handleQueryAuthError(error),
  }),
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

let browserQueryClient: QueryClient | undefined;

/**
 * Browser: reuse one client (HMR-safe). Server: fresh client per call so requests
 * never share in-memory cache.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return createQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
    window.__GATI_QUERY_CLIENT__ = browserQueryClient;
  }
  return browserQueryClient;
}

/** Shared singleton for imperative cache writes (store layout priming, etc.). */
export const queryClient = getQueryClient();

/**
 * Persister instance for localStorage persistence
 * Only persists Tier 1 (Static) and Tier 2 (Medium) data
 */
export const persister = createPersister();
