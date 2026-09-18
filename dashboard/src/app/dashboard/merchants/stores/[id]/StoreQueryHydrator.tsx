"use client";

import { useEffect, useLayoutEffect } from "react";
import { getQueryClient } from "@/lib/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { prefetchStoreMenu } from "@/hooks/queries/useMerchantStoreQueries";
import { queryKeys } from "@/lib/queryKeys";
import { readStoreOperationsCache, writeStoreOperationsCache } from "@/lib/merchants/partner-store-ops-cache";
import { useLocalStoreStatusEngineStore } from "@/lib/localStoreStatusEngineStore";

/**
 * Primes React Query store + ops cache so sidebar and dashboard get instant data.
 * Uses the shared singleton (not useQueryClient) so Fast Refresh / PersistQueryClient
 * remounts never throw "No QueryClient set".
 */
export function StoreQueryHydrator({
  storeId,
  store,
}: {
  storeId: string;
  store: StoreProfile | null;
}) {
  // Before paint: seed ops from sessionStorage so Store Status isn't stuck on skeleton.
  useLayoutEffect(() => {
    if (!storeId) return;
    try {
      const queryClient = getQueryClient();
      if (store) {
        queryClient.setQueryData(STORE_KEY(storeId), store);
      }
      useLocalStoreStatusEngineStore.getState().hydrate(storeId);
      const cachedOps = readStoreOperationsCache(storeId);
      if (cachedOps) {
        queryClient.setQueryData(queryKeys.merchantStore.storeOperations(storeId), cachedOps);
      }
    } catch {
      /* ignore */
    }
  }, [storeId, store]);

  useEffect(() => {
    if (!storeId) return;
    const queryClient = getQueryClient();
    void queryClient.prefetchQuery({
      queryKey: queryKeys.merchantStore.storeOperations(storeId),
      queryFn: async () => {
        const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
        writeStoreOperationsCache(storeId, data);
        return data;
      },
      staleTime: 10 * 60 * 1000,
    });
    prefetchStoreMenu(queryClient, storeId);
  }, [storeId]);

  return null;
}
