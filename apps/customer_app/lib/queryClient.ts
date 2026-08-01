/**
 * App-wide QueryClient singleton.
 *
 * Lives outside the React tree so non-React code (auth logout, customer-scope
 * teardown) can drop every cached customer-specific response without needing a
 * hook. `app/_layout.tsx` feeds this same instance to QueryClientProvider.
 */

import { QueryClient } from "@tanstack/react-query";
import { isNetworkError } from "@/utils/networkError";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        const status = (error as { status?: number })?.status;
        if (status === 503 || isNetworkError(error)) return true;
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const status = (error as { status?: number })?.status;
        return status === 503 || isNetworkError(error);
      },
      retryDelay: (attempt) => 2000 * (attempt + 1),
    },
  },
});
