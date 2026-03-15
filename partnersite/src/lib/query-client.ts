'use client';

import { QueryClient } from '@tanstack/react-query';

/**
 * Production-safe QueryClient for cache and memory management.
 * - staleTime: 60s — avoid refetching same data on every mount/navigation.
 * - gcTime (cacheTime): 5 min — unused cache entries are garbage-collected to limit memory.
 * - refetchOnWindowFocus: true — refetch when user returns (with staleTime so not every time).
 * - retry: 1 — one retry on failure; avoids long hangs on bad network.
 * - structuralSharing: true — keeps referential equality when data unchanged (fewer re-renders).
 */
const STALE_TIME_MS = 60 * 1000;
const GC_TIME_MS = 5 * 60 * 1000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: true,
        retry: 1,
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
