"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthOptional } from "@/providers/AuthProvider";

type WalletRequestsSummaryResponse = {
  success: boolean;
  counts: Record<string, number>;
  total: number;
};

async function fetchWalletRequestsSummary(
  url: string,
  signal?: AbortSignal
): Promise<WalletRequestsSummaryResponse> {
  const res = await fetch(url, {
    credentials: "include",
    signal,
    cache: "no-store",
  });
  const data = (await res.json()) as WalletRequestsSummaryResponse;
  if (!res.ok || !data?.success) {
    throw new Error((data as { error?: string })?.error ?? "Failed to fetch wallet requests summary");
  }
  return data;
}

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes
const GC_TIME_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Shared summary hook for:
 * - GET /api/merchant/wallet-requests/summary (global merchants dashboard)
 * - GET /api/merchant/stores/:storeId/wallet-requests/summary (store-scoped payments page)
 */
export function useMerchantWalletRequestsSummaryQuery(storeId: string | null | undefined) {
  const pathname = usePathname();
  const auth = useAuthOptional();

  const cleanPathname = pathname?.split("?")[0].split("#")[0] ?? "";

  const session = auth?.user;
  const authReady = auth?.authReady ?? false;

  const url = storeId
    ? `/api/merchant/stores/${storeId}/wallet-requests/summary`
    : "/api/merchant/wallet-requests/summary";

  const isOnMerchantsHome = cleanPathname === "/dashboard/merchants";

  // Strict enabled condition:
  // - global summary only runs on /dashboard/merchants
  // - store-scoped summary runs on store pages (only gated by auth)
  const enabled = Boolean(session && authReady && url && (storeId ? true : isOnMerchantsHome));

  const fetchSummary = useCallback(
    ({ signal }: { signal?: AbortSignal }) => fetchWalletRequestsSummary(url, signal),
    [url]
  );

  return useQuery({
    queryKey: queryKeys.merchantWalletRequests.summary(storeId ?? null),
    queryFn: fetchSummary,
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}

