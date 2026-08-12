"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { queryKeys } from "@/lib/queryKeys";
import { readStoreOperationsCache } from "@/lib/merchants/partner-store-ops-cache";
import { useLocalStoreStatusEngineStore } from "@/lib/localStoreStatusEngineStore";

/** Primes React Query store + ops cache so sidebar and dashboard get instant data. */
export function StoreQueryHydrator({
  storeId,
  store,
}: {
  storeId: string;
  store: StoreProfile | null;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (storeId && store) {
      queryClient.setQueryData(STORE_KEY(storeId), store);
    }
  }, [queryClient, storeId, store]);

  useEffect(() => {
    if (!storeId) return;
    useLocalStoreStatusEngineStore.getState().hydrate(storeId);
    const cachedOps = readStoreOperationsCache(storeId);
    if (cachedOps) {
      queryClient.setQueryData(queryKeys.merchantStore.storeOperations(storeId), cachedOps);
    }
    // Warm network cache in background for first visit / stale session.
    void queryClient.prefetchQuery({
      queryKey: queryKeys.merchantStore.storeOperations(storeId),
      queryFn: async () => {
        const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
        return data;
      },
      staleTime: 10 * 60 * 1000,
    });
  }, [queryClient, storeId]);

  return null;
}
