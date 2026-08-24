"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getCacheConfig, CacheTier } from "@/lib/cache-strategies";
import { safeParseJson } from "@/lib/utils";
import type { DashboardType, AccessPointGroup } from "@/lib/db/schema";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { useAuthOptional } from "@/providers/AuthProvider";

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
  code?: string;
}

function readDashboardAccessCache(
  queryClient: ReturnType<typeof useQueryClient>,
  systemUserId?: number | null
): DashboardAccessData | undefined {
  const scoped = queryClient.getQueryData<DashboardAccessData>(
    queryKeys.dashboardAccess(systemUserId)
  );
  if (scoped) return scoped;
  return queryClient.getQueryData<DashboardAccessData>(queryKeys.dashboardAccess());
}

/** Exported for prefetch in dashboard layout */
export async function fetchDashboardAccess(): Promise<DashboardAccessData> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch("/api/auth/dashboard-access", {
      credentials: "include",
      cache: "no-store",
    });
    const text = await response.text();
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");

    if (!response.ok) {
      let errorMessage = `Failed to fetch dashboard access: ${response.status}`;
      let errorCode = "";
      if (isJson && text.trim()) {
        try {
          const errorData = safeParseJson<{ error?: string; code?: string }>(text, "");
          if (errorData?.error) errorMessage = errorData.error;
          if (errorData?.code) errorCode = errorData.code;
        } catch {
          if (text.length < 200) errorMessage = text.trim();
        }
      }
      if (
        response.status === 401 &&
        errorCode === "SESSION_REQUIRED" &&
        attempt < maxAttempts
      ) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      if (response.status === 503 || errorCode === SERVICE_UNAVAILABLE || errorCode === "SESSION_REQUIRED") {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        const err = new Error(errorMessage);
        (err as Error & { code?: string }).code = SERVICE_UNAVAILABLE;
        throw err;
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
  throw new Error("Failed to fetch dashboard access");
}

/**
 * Hook to fetch and cache user dashboard access
 * Uses React Query for automatic caching and refetching
 */
export function useDashboardAccessQuery() {
  const staticConfig = getCacheConfig(CacheTier.STATIC);
  const auth = useAuthOptional();
  const queryClient = useQueryClient();
  const { systemUserId } = usePermissions();
  const accessKey = queryKeys.dashboardAccess(systemUserId);
  const cached = readDashboardAccessCache(queryClient, systemUserId);
  const authReady = auth?.authReady ?? false;

  return useQuery({
    queryKey: accessKey,
    queryFn: fetchDashboardAccess,
    ...staticConfig,
    enabled: authReady || cached != null,
    initialData: cached,
    // Keep STATIC defaults — aggressive remount/focus refetch caused auth storms
    // (permissions + dashboard-access + bootstrap in parallel) → 401/logout on nav.
    placeholderData: (previousData) =>
      previousData ?? readDashboardAccessCache(queryClient, systemUserId),
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      if (error instanceof Error) {
        const code = (error as Error & { code?: string }).code;
        if (code === SERVICE_UNAVAILABLE || error.message.includes("503") || error.name === "AbortError") return true;
        if (error.message.includes("SESSION_REQUIRED")) return true;
        if (error.message.includes("401") || error.message.includes("404")) return false;
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
  const { data, isLoading, isFetching, fetchStatus, error } = useDashboardAccessQuery();

  return {
    dashboards: data?.dashboards ?? [],
    accessPoints: data?.accessPoints ?? [],
    loading:
      fetchStatus === "fetching" && data === undefined && !error
        ? true
        : isLoading && data === undefined && !error,
    error: error ? (error instanceof Error ? error.message : "Unknown error") : null,
    isFetching,
  };
}
