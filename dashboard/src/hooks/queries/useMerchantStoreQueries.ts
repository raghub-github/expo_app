"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const STALE_MS = 5 * 60 * 1000; // 5 minutes
const GC_TIME_MS = 10 * 60 * 1000; // 10 minutes – cache survives navigation
const SHARED_OPTIONS = {
  staleTime: STALE_MS,
  gcTime: GC_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 1,
} as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Request failed");
  return data as T;
}

/** Shared query: store stats. Single request per storeId+date, cached 5min. */
export function useStoreStatsQuery(
  storeId: string | null,
  statsDate?: string,
  options?: { refetchInterval?: number }
) {
  const url =
    storeId && statsDate
      ? `/api/merchant/stores/${storeId}/stats?date=${encodeURIComponent(statsDate)}`
      : storeId
        ? `/api/merchant/stores/${storeId}/stats`
        : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.stats(storeId ?? "", statsDate),
    queryFn: () => fetchJson(url!),
    enabled: Boolean(storeId && url),
    ...SHARED_OPTIONS,
    ...(options?.refetchInterval != null && { refetchInterval: options.refetchInterval }),
  });
}

/** Shared query: store wallet. Single request per storeId, cached 5min. */
export function useStoreWalletQuery(storeId: string | null) {
  const url = storeId ? `/api/merchant/stores/${storeId}/wallet` : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.wallet(storeId ?? ""),
    queryFn: () => fetchJson(url!),
    enabled: Boolean(storeId && url),
    ...SHARED_OPTIONS,
  });
}

/** Shared query: store operations. Single request per storeId, cached 5min. */
export function useStoreOperationsQuery(storeId: string | null) {
  const url = storeId ? `/api/merchant/stores/${storeId}/store-operations` : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.storeOperations(storeId ?? ""),
    queryFn: () => fetchJson(url!),
    enabled: Boolean(storeId && url),
    ...SHARED_OPTIONS,
  });
}

/** Invalidate store queries after mutations (e.g. toggle open/close, wallet update). */
export function useInvalidateMerchantStoreQueries() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.stats(storeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.wallet(storeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.storeOperations(storeId) });
  };
}
