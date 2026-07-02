"use client";

import { useLayoutEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { StoreLayoutShell } from "./StoreLayoutShell";
import type { StoreInfo } from "./StoreLayoutShell";

/**
 * Wraps the store layout with QueryClientProvider and primes the store cache
 * so useStore(storeId) has data on first render (no loading flash).
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
  useLayoutEffect(() => {
    const client = getQueryClient();
    if (storeId && store) {
      client.setQueryData(STORE_KEY(storeId), store as StoreProfile);
    }
  }, [storeId, store]);

  return (
    <QueryClientProvider client={getQueryClient()}>
      <StoreLayoutShell storeId={storeId} store={store}>
        {children}
      </StoreLayoutShell>
    </QueryClientProvider>
  );
}
