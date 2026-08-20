"use client";

import { useLayoutEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { StoreLayoutShell } from "./StoreLayoutShell";
import type { StoreInfo } from "./StoreLayoutShell";

/**
 * Primes the store cache so useStore(storeId) has data on first paint.
 * Re-provides the singleton QueryClient so Fast Refresh / PersistQueryClient
 * remounts cannot throw "No QueryClient set" in this subtree.
 */
export function StoreLayoutWrapper({
  storeId,
  store,
  children,
}: {
  storeId: string;
  store: StoreInfo | null;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => getQueryClient());

  useLayoutEffect(() => {
    if (storeId && store) {
      queryClient.setQueryData(STORE_KEY(storeId), store as StoreProfile);
    }
  }, [storeId, store, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <StoreLayoutShell storeId={storeId} store={store}>
        {children}
      </StoreLayoutShell>
    </QueryClientProvider>
  );
}
