"use client";

import { useEffect } from "react";
import { getQueryClient } from "@/lib/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
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
  useEffect(() => {
    const queryClient = getQueryClient();
    if (storeId && store) {
      queryClient.setQueryData(STORE_KEY(storeId), store);
    }
  }, [storeId, store]);

  useEffect(() => {
    if (!storeId) return;
    const queryClient = getQueryClient();
    useLocalStoreStatusEngineStore.getState().hydrate(storeId);
    const cachedOps = readStoreOperationsCache(storeId);
    if (cachedOps) {
      queryClient.setQueryData(queryKeys.merchantStore.storeOperations(storeId), cachedOps);
    }
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
  }, [storeId]);

  return null;
}
