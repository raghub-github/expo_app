"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { permissionsCacheConfig } from "@/lib/cache-strategies";
import { safeParseJson } from "@/lib/utils";

export interface PermissionsData {
  exists: boolean;
  systemUserId: number | null;
  isSuperAdmin: boolean;
  roles?: string[] | Array<{ id?: number; roleId?: string; roleName?: string; roleType?: string; isPrimary?: boolean }>;
  permissions?: string[] | Array<{ module: string; action: string; resourceType?: string }>;
  /** Normalized "MODULE:ACTION" keys for fast client-side checks. Prefer over parsing permissions. */
  permissionStrings?: string[];
  message?: string;
}

interface PermissionsResponse {
  success: boolean;
  data?: PermissionsData;
  error?: string;
}

const PERMISSIONS_FETCH_TIMEOUT_MS = 30000; // 30s – avoid infinite loading; UI shows Retry and uses cache when available
const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

/** Exported for prefetch in dashboard layout */
export async function fetchPermissions(): Promise<PermissionsData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("Request timed out. Tap Retry to try again.", "AbortError")),
    PERMISSIONS_FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch("/api/auth/permissions", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");

    if (!response.ok) {
      let errorMessage = `Failed to fetch permissions: ${response.status}`;
      if (isJson && text.trim()) {
        try {
          const errorData = safeParseJson<{ error?: string }>(text, "");
          if (errorData?.error) errorMessage = errorData.error;
        } catch {
          if (text.length < 200) errorMessage = text.trim();
        }
      }
      if (response.status === 503) {
        const err = new Error(errorMessage);
        (err as Error & { code?: string }).code = SERVICE_UNAVAILABLE;
        throw err;
      }
      throw new Error(errorMessage);
    }

    if (!isJson || !text.trim()) {
      throw new Error("Invalid response from permissions API");
    }
    let result: PermissionsResponse;
    try {
      result = safeParseJson<PermissionsResponse>(text, "Invalid response from permissions API");
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Invalid response from permissions API");
    }

    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to fetch permissions");
    }
    return result.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Hook to fetch and cache user permissions
 * Uses React Query for automatic caching and refetching
 */
export function usePermissionsQuery() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePermissionsQuery.ts:86',message:'usePermissionsQuery hook called',data:{cacheConfig:permissionsCacheConfig},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  return useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: fetchPermissions,
    ...permissionsCacheConfig,
    placeholderData: (previousData) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/2cc0b640-978a-4fbb-81f9-cf64378f704f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usePermissionsQuery.ts:91',message:'placeholderData check',data:{hasPreviousData:!!previousData},timestamp:Date.now(),runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return previousData;
    },
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      if (error instanceof Error) {
        const code = (error as Error & { code?: string }).code;
        if (code === SERVICE_UNAVAILABLE || error.message.includes("503") || error.name === "AbortError") return true;
        // Retry on network errors (e.g. "Failed to fetch", connection refused)
        if (error.message === "Failed to fetch" || error.name === "TypeError") return true;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

/**
 * Convenience hook that returns the same interface as the old usePermissions hook
 * for backward compatibility during migration
 */
export function usePermissions() {
  const { data, isLoading, error } = usePermissionsQuery();

  return {
    isSuperAdmin: data?.isSuperAdmin ?? false,
    systemUserId: data?.systemUserId ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "Unknown error") : null,
    exists: data?.exists ?? false,
    roles: data?.roles ?? [],
    permissions: data?.permissions ?? [],
  };
}
