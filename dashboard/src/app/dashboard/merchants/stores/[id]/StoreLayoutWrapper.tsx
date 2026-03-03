"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/react-query";
import { StoreLayoutShell } from "./StoreLayoutShell";
import type { StoreInfo } from "./StoreLayoutShell";

/**
 * Wraps the store layout with QueryClientProvider so StoreQueryHydrator
 * (used inside StoreLayoutShell) has access to the query client. Needed because
 * in some Next.js rendering flows the layout segment can run before the root
 * provider is available.
 */
export function StoreLayoutWrapper({
  storeId,
  store,
  children,
}: {
  storeId: string;
  store: StoreInfo;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreLayoutShell storeId={storeId} store={store}>
        {children}
      </StoreLayoutShell>
    </QueryClientProvider>
  );
}
