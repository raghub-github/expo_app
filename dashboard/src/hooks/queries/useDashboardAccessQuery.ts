"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import type { DashboardType, AccessPointGroup } from "@/lib/db/schema";

interface DashboardAccess {
  dashboardType: string;
  accessLevel: string;
  isActive: boolean;
}

interface AccessPoint {
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

async function fetchDashboardAccess(): Promise<DashboardAccessData> {
  const response = await fetch("/api/auth/dashboard-access", {
    credentials: "include", // Include cookies for session
    cache: "no-store", // Always fetch fresh data
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to fetch dashboard access: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const result: DashboardAccessResponse = await response.json();

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
  
  return useQuery({
    queryKey: queryKeys.dashboardAccess(),
    queryFn: fetchDashboardAccess,
    ...staticConfig,
    retry: (failureCount, error) => {
      // Don't retry on 401 (unauthorized) or 404 (user not found)
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("404")) {
          return false;
        }
      }
      // Retry up to 2 times for other errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
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
