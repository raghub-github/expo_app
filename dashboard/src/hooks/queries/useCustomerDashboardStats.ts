"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import { DashboardStats } from "@/lib/db/operations/customer-stats";
import { useAuthOptional } from "@/providers/AuthProvider";

interface DashboardStatsResponse {
  success: boolean;
  data?: DashboardStats;
  error?: string;
}

export interface DashboardStatsFilters {
  orderType?: "food" | "parcel" | "person_ride";
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  accountStatus?: string;
  riskFlag?: string;
}

async function fetchDashboardStats(
  filters: DashboardStatsFilters = {}
): Promise<DashboardStats> {
  const searchParams = new URLSearchParams();
  
  if (filters.orderType) searchParams.set("orderType", filters.orderType);
  if (filters.dateFrom) searchParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) searchParams.set("dateTo", filters.dateTo);
  if (filters.city) searchParams.set("city", filters.city);
  if (filters.accountStatus) searchParams.set("accountStatus", filters.accountStatus);
  if (filters.riskFlag) searchParams.set("riskFlag", filters.riskFlag);

  const response = await fetch(`/api/customers/stats?${searchParams.toString()}`);
  const result: DashboardStatsResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch dashboard statistics");
  }

  return result.data;
}

/**
 * Hook to fetch customer dashboard statistics
 * Uses React Query for automatic caching and refetching
 */
export function useCustomerDashboardStats(
  filters: DashboardStatsFilters = {},
  options?: { enabled?: boolean }
) {
  const auth = useAuthOptional();
  const sessionUser = auth?.user;
  const permissions = auth?.permissions;
  const authReady = auth?.authReady ?? false;
  const isAllowed = Boolean(authReady && sessionUser && permissions);

  return useQuery({
    queryKey: queryKeys.customers.stats(filters as unknown as Record<string, unknown>),
    queryFn: () => fetchDashboardStats(filters),
    enabled: isAllowed && options?.enabled !== false,    ...getCacheConfig(CacheTier.MEDIUM),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Keep previous data during refetch to avoid UI flicker on filter changes.
    placeholderData: (prev) => prev,
  });
}
