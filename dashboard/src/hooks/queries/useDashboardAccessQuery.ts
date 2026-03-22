"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import { safeParseJson } from "@/lib/utils";
import type { DashboardType, AccessPointGroup } from "@/lib/db/schema";

const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

interface DashboardAccess {
  dashboardType: string;
  accessLevel: string;
  isActive: boolean;
}

export interface AccessPoint {
  dashboardType: string;
  accessPointGroup: string;
  accessPointName: string;
  allowedActions: string[];
  isActive: boolean;
}

interface DashboardAccessData {
  dashboards: DashboardAccess[];
  accessPoints: AccessPoint[];
}

interface DashboardAccessResponse {
  success: boolean;
  data?: DashboardAccessData;
  error?: string;
}

/** Exported for prefetch in dashboard layout */
export async function fetchDashboardAccess(): Promise<DashboardAccessData> {
  const response = await fetch("/api/auth/dashboard-access", {
    credentials: "include",
    cache: "no-store",
  });
  const text = await response.text();
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");

  if (!response.ok) {
    let errorMessage = `Failed to fetch dashboard access: ${response.status}`;
    if (isJson && text.trim()) {
      try {
        const errorData = safeParseJson<{ error?: string }>(text, "");
        if (errorData?.error) errorMessage = errorData.error;
      } catch {
        if (text.length < 200) errorMessage = text.trim();
      }
    }
    throw new Error(errorMessage);
  }

  if (!isJson || !text.trim()) {
    throw new Error("Invalid response from dashboard access API");
  }
  let result: DashboardAccessResponse;
  try {
    result = safeParseJson<DashboardAccessResponse>(text, "Invalid response from dashboard access API");
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Invalid response from dashboard access API");
  }

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch dashboard access");
  }

  return result.data;
}

/**
 * Hook to fetch and cache user dashboard access
 * Uses React Query for automatic caching and refetching
 */
export function useDashboardAccessQuery() {
  const staticConfig = getCacheConfig(CacheTier.STATIC);
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDashboardAccessQuery.ts:79',message:'useDashboardAccessQuery hook called',data:{cacheConfig:staticConfig},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  return useQuery({
    queryKey: queryKeys.dashboardAccess(),
    queryFn: fetchDashboardAccess,
    ...staticConfig,
    placeholderData: (previousData) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDashboardAccessQuery.ts:86',message:'placeholderData check',data:{hasPreviousData:!!previousData},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return previousData;
    },
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("404")) return false;
        const code = (error as Error & { code?: string }).code;
        if (code === SERVICE_UNAVAILABLE || error.message.includes("503") || error.name === "AbortError") return true;
        if (error.message === "Failed to fetch" || error.name === "TypeError") return true;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

/**
 * Hook to check if user has access to a specific dashboard
 */
export function useHasDashboardAccess(dashboardType: DashboardType): boolean {
  const { data, isLoading } = useDashboardAccessQuery();

  if (isLoading) {
    return false; // Don't show content while loading
  }

  return data?.dashboards.some(
    (d) => d.dashboardType === dashboardType && d.isActive
  ) ?? false;
}

/**
 * Hook to get access points for a specific dashboard
 */
export function useDashboardAccessPoints(
  dashboardType: DashboardType
): AccessPoint[] {
  const { data } = useDashboardAccessQuery();

  return data?.accessPoints.filter(
    (ap) => ap.dashboardType === dashboardType && ap.isActive
  ) ?? [];
}

/**
 * Hook to check if user has a specific access point
 */
export function useHasAccessPoint(
  dashboardType: DashboardType,
  accessPointGroup: AccessPointGroup
): boolean {
  const { data } = useDashboardAccessQuery();

  return data?.accessPoints.some(
    (ap) =>
      ap.dashboardType === dashboardType &&
      ap.accessPointGroup === accessPointGroup &&
      ap.isActive
  ) ?? false;
}

/**
 * Backward compatibility hook - returns the same interface as the old useDashboardAccess
 */
export function useDashboardAccess() {
  const { data, isLoading, error } = useDashboardAccessQuery();

  return {
    dashboards: data?.dashboards ?? [],
    accessPoints: data?.accessPoints ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "Unknown error") : null,
  };
}
