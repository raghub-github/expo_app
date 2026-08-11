"use client";

import { useLayoutEffect } from "react";
import { getQueryClient } from "@/lib/react-query";
import { STORE_KEY } from "@/hooks/useStore";
import type { StoreProfile } from "@/hooks/useStore";
import { StoreLayoutShell } from "./StoreLayoutShell";
import type { StoreInfo } from "./StoreLayoutShell";

/**
 * Primes the store cache so useStore(storeId) has data on first paint (no loading flash).
 * Uses the root PersistQueryClientProvider — do not nest another QueryClientProvider here
 * (nested providers caused intermittent "No QueryClient set" and remount thrash).
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
    <StoreLayoutShell storeId={storeId} store={store}>
      {children}
    </StoreLayoutShell>
  );
}
