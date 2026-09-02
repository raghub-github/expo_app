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
      /**
       * Network errors and 503s are already retried (with backoff) by the axios
       * interceptor in services/api.ts. Retrying them again here multiplied the
       * two budgets together — up to 16 requests for a single logical fetch on a
       * flaky connection, while the tracking pollers kept queueing more. This
       * layer now only retries what the transport deliberately does not: a
       * single attempt for non-network failures, which covers a transient 500 or
       * a query function that itself threw.
       */
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false;
        const status = (error as { status?: number })?.status;
        if (status === 503 || isNetworkError(error)) return false;
        return true;
      },
      retryDelay: () => 1_500,
      throwOnError: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const status = (error as { status?: number })?.status;
        return status === 503 || isNetworkError(error);
      },
      retryDelay: (attempt) => 2000 * (attempt + 1),
      throwOnError: false,
    },
  },
});
