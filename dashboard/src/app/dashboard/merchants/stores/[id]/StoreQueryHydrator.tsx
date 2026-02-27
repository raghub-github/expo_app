"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";

/** Primes React Query store cache with server-fetched store so sidebar and dashboard get instant data. */
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
  return null;
}
