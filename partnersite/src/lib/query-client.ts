'use client';

import { QueryClient } from '@tanstack/react-query';

/**
 * Production-safe QueryClient for cache and memory management.
 * - staleTime: 2 min — avoid refetching same data on every mount/navigation.
 * - gcTime (cacheTime): 10 min — unused cache entries are garbage-collected to limit memory.
 * - refetchOnMount / refetchOnWindowFocus: false — tab switches feel instant when cache is warm.
 * - retry: 1 — one retry on failure; avoids long hangs on bad network.
 * - structuralSharing: true — keeps referential equality when data unchanged (fewer re-renders).
 */
const STALE_TIME_MS = 2 * 60 * 1000;
const GC_TIME_MS = 10 * 60 * 1000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (failureCount >= 1) return false;
          const msg = error instanceof Error ? error.message : String(error ?? "");
          // Never retry:
          //   • network errors / offline (won't recover immediately)
          //   • aborted (client timeout fired — don't pile on)
          //   • 5xx from the backend (nginx 504 / 500 — retrying floods the same slow endpoint)
          if (/network error|failed to fetch|aborted|abortsignal|status: 5\d\d/i.test(msg)) {
            return false;
          }
          return true;
        },
        structuralSharing: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
