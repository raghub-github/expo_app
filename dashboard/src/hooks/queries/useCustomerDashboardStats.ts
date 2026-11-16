"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import { DashboardStats } from "@/lib/db/operations/customer-stats";
import { useAuthOptional } from "@/providers/AuthProvider";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";

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

/** Drop empty keys so `{}` and `{orderType: undefined}` share one cache entry. */
export function normalizeDashboardStatsFilters(
  filters: DashboardStatsFilters = {}
): DashboardStatsFilters {
  const out: DashboardStatsFilters = {};
  if (filters.orderType) out.orderType = filters.orderType;
  if (filters.dateFrom) out.dateFrom = filters.dateFrom;
  if (filters.dateTo) out.dateTo = filters.dateTo;
  if (filters.city) out.city = filters.city;
  if (filters.accountStatus) out.accountStatus = filters.accountStatus;
  if (filters.riskFlag) out.riskFlag = filters.riskFlag;
  return out;
}

export async function fetchDashboardStats(
  filters: DashboardStatsFilters = {}
): Promise<DashboardStats> {
  const normalized = normalizeDashboardStatsFilters(filters);
  const searchParams = new URLSearchParams();

  if (normalized.orderType) searchParams.set("orderType", normalized.orderType);
  if (normalized.dateFrom) searchParams.set("dateFrom", normalized.dateFrom);
  if (normalized.dateTo) searchParams.set("dateTo", normalized.dateTo);
  if (normalized.city) searchParams.set("city", normalized.city);
  if (normalized.accountStatus) searchParams.set("accountStatus", normalized.accountStatus);
  if (normalized.riskFlag) searchParams.set("riskFlag", normalized.riskFlag);

  const qs = searchParams.toString();
  const response = await fetch(`/api/customers/stats${qs ? `?${qs}` : ""}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    const err = new Error("Not authenticated") as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    const err = new Error("Stats temporarily unavailable") as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  const result: DashboardStatsResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch dashboard statistics");
  }

  return result.data;
}

/**
 * Hook to fetch customer dashboard statistics.
 * Cached aggressively so revisiting Customers never flash card skeletons.
 */
export function useCustomerDashboardStats(
  filters: DashboardStatsFilters = {},
  options?: { enabled?: boolean }
) {
  const auth = useAuthOptional();
  const queryClient = useQueryClient();
  const { data: permissionsData, isLoading: permissionsLoading } = usePermissionsQuery();
  const sessionUser = auth?.user;
  const authReady = auth?.authReady ?? false;
  const permissionsReady = Boolean(auth?.permissions ?? permissionsData);
  // Do not gate on permissionsLoading when we already have permissions data —
  // that flicker was disabling the query and clearing the UI into skeletons.
  const authGateReady = Boolean(
    authReady && sessionUser && permissionsReady && !(permissionsLoading && !permissionsData)
  );

  const normalized = useMemo(
    () => normalizeDashboardStatsFilters(filters),
    [
      filters.orderType,
      filters.dateFrom,
      filters.dateTo,
      filters.city,
      filters.accountStatus,
      filters.riskFlag,
    ]
  );

  const queryKey = queryKeys.customers.stats(normalized as unknown as Record<string, unknown>);
  const cached = queryClient.getQueryData<DashboardStats>(queryKey);
  const enabled = authGateReady && options?.enabled !== false;

  return useQuery({
    queryKey,
    queryFn: () => fetchDashboardStats(normalized),
    enabled,
    ...getCacheConfig(CacheTier.MEDIUM),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // Respect MEDIUM tier: do NOT refetchOnMount "always" — that re-entered
    // skeleton state on every visit even with fresh cache.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: cached,
    initialDataUpdatedAt: cached
      ? queryClient.getQueryState(queryKey)?.dataUpdatedAt
      : undefined,
    placeholderData: (prev) => prev ?? cached,
    retry: (failureCount, error) => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 401 || status === 403) return false;
      if (status === 502 || status === 503 || status === 504) return failureCount < 1;
      return failureCount < 1;
    },
  });
}
