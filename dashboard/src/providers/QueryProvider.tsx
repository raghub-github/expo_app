"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
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
 * Outer QueryClientProvider uses the app's @tanstack/react-query copy so
 * useQueryClient / useQuery never miss context (persist-client can resolve a
 * second copy). Same singleton client as PersistQueryClientProvider.
 *
 * Persist is deferred until after mount so restore/hydrate does not call
 * setState during the first render (React 19 warning).
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => getQueryClient());
  const [persistReady, setPersistReady] = useState(false);

  useEffect(() => {
    setPersistReady(true);
  }, []);

  if (!persistReady) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
