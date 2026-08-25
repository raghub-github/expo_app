"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { permissionsCacheConfig } from "@/lib/cache-strategies";
import { safeParseJson } from "@/lib/utils";
import { useAuthOptional } from "@/providers/AuthProvider";

export interface PermissionsData {
  exists: boolean;
  systemUserId: number | null;
  isSuperAdmin: boolean;
  canTogglePortal?: boolean;
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
  code?: string;
}

const PERMISSIONS_FETCH_TIMEOUT_MS = 30000; // 30s – avoid infinite loading; UI shows Retry and uses cache when available
const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

/** Exported for prefetch in dashboard layout */
export async function fetchPermissions(): Promise<PermissionsData> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
        // Cookie/compile race right after bootstrap — retry like /api/auth/bootstrap.
        if (
          response.status === 401 &&
          errorCode === "SESSION_REQUIRED" &&
          attempt < maxAttempts
        ) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        if (
          response.status === 503 ||
          errorCode === SERVICE_UNAVAILABLE ||
          errorCode === "SESSION_REQUIRED"
        ) {
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
  throw new Error("Failed to fetch permissions");
}

/**
 * Hook to fetch and cache user permissions
 * Uses React Query for automatic caching and refetching
 */
export function usePermissionsQuery() {
  const auth = useAuthOptional();
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<PermissionsData>(queryKeys.permissions());
  const authReady = auth?.authReady ?? false;

  return useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: fetchPermissions,
    ...permissionsCacheConfig,
    enabled: authReady || cached != null,
    initialData: cached,
    placeholderData: (previousData) => previousData ?? cached,
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      if (error instanceof Error) {
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
 * Convenience hook that returns the same interface as the old usePermissions hook
 * for backward compatibility during migration
 */
export function usePermissions() {
  const { data, isLoading, isFetching, fetchStatus, error } = usePermissionsQuery();

  return {
    isSuperAdmin: data?.isSuperAdmin ?? false,
    canTogglePortal: data?.canTogglePortal ?? false,
    systemUserId: data?.systemUserId ?? null,
    // Only loading while actively fetching without cached data — not when query is disabled pre-bootstrap.
    loading:
      fetchStatus === "fetching" && data === undefined && !error
        ? true
        : isLoading && data === undefined && !error,
    error: error ? (error instanceof Error ? error.message : "Unknown error") : null,
    exists: data?.exists ?? false,
    roles: data?.roles ?? [],
    permissions: data?.permissions ?? [],
  };
}
