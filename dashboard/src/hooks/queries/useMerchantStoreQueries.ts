"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthOptional } from "@/providers/AuthProvider";
import { usePathname } from "next/navigation";

const STALE_MS = 10 * 60 * 1000; // 10 minutes
const GC_TIME_MS = 30 * 60 * 1000; // 30 minutes – cache survives navigation
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
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);

  const url =
    storeId && statsDate
      ? `/api/merchant/stores/${storeId}/stats?date=${encodeURIComponent(statsDate)}`
      : storeId
        ? `/api/merchant/stores/${storeId}/stats`
        : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.stats(storeId ?? "", statsDate),
    queryFn: () => fetchJson(url!),
    enabled: Boolean(storeId && url) && isAllowed,
    ...SHARED_OPTIONS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...(options?.refetchInterval != null && { refetchInterval: options.refetchInterval }),
  });
}

/** Shared query: store wallet. Single request per storeId, cached 5min. */
export function useStoreWalletQuery(storeId: string | null) {
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);

  const url = storeId ? `/api/merchant/stores/${storeId}/wallet` : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.wallet(storeId ?? ""),
    queryFn: () => fetchJson(url!),
    enabled: Boolean(storeId && url) && isAllowed,
    ...SHARED_OPTIONS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Shared query: store operations. Single request per storeId, cached 5min. */
export function useStoreOperationsQuery(storeId: string | null) {
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);

  const url = storeId ? `/api/merchant/stores/${storeId}/store-operations` : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.storeOperations(storeId ?? ""),
    queryFn: () => fetchJson(url!),
    enabled: Boolean(storeId && url) && isAllowed,
    ...SHARED_OPTIONS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Dashboard/merchants page: aggregated stats (total, verified, pending, etc.). Cached 2min for fast revisit. */
export function useMerchantStoresStatsQuery(fromDate?: string, toDate?: string) {
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);
  const pathname = usePathname();
  const cleanPathname = pathname?.split("?")[0].split("#")[0] ?? "";
  const isOnMerchantsHome = cleanPathname === "/dashboard/merchants";

  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const qs = params.toString();
  const url = `/api/merchant/stores/stats${qs ? `?${qs}` : ""}`;
  return useQuery({
    queryKey: queryKeys.merchantStores.stats(fromDate, toDate),
    queryFn: () =>
      fetchJson<{
        success: boolean;
        total?: number;
        verified?: number;
        pending?: number;
        rejected?: number;
        new?: number;
      }>(url),
    enabled: Boolean(isAllowed && isOnMerchantsHome),
    staleTime: STALE_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Keep previous stats visible while refetching on date/filter changes for smooth UX.
    placeholderData: (prev) => prev,
  });
}

/** Store menu (categories + items). Cached 3min so menu tab revisits are instant. */
export function useStoreMenuQuery(storeId: string | null) {
  const url = storeId ? `/api/merchant/stores/${storeId}/menu` : null;
  return useQuery({
    queryKey: queryKeys.merchantStore.menu(storeId ?? ""),
    queryFn: () => fetchJson<{ success: boolean; categories?: unknown[]; items?: unknown[] }>(url!),
    enabled: Boolean(storeId && url),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  });
}

/** Invalidate store queries after mutations (e.g. toggle open/close, wallet update, menu change). */
export function useInvalidateMerchantStoreQueries() {
  const queryClient = useQueryClient();
  return (storeId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.stats(storeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.wallet(storeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.storeOperations(storeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.menu(storeId) });
  };
}
