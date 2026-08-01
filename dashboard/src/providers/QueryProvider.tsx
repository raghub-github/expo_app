"use client";

import { useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { getQueryClient, persister } from "@/lib/react-query";

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * React Query Devtools are disabled to avoid ChunkLoadError when the devtools
 * chunk fails to load (e.g. in some dev setups). To re-enable, add:
 *   import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
 *   <ReactQueryDevtools initialIsOpen={false} />
 * inside the provider (dev only).
 *
 * Use PersistQueryClientProvider alone (it already wraps QueryClientProvider).
 * Nesting both caused intermittent "No QueryClient set" during Fast Refresh / SSR.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        buster: "", // Cache version buster (increment to invalidate all cache)
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
