"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { permissionsCacheConfig } from "@/lib/cache-strategies";

interface PermissionsData {
  exists: boolean;
  systemUserId: number | null;
  isSuperAdmin: boolean;
  roles?: string[];
  permissions?: string[];
  message?: string;
}

interface PermissionsResponse {
  success: boolean;
  data?: PermissionsData;
  error?: string;
}

async function fetchPermissions(): Promise<PermissionsData> {
  const response = await fetch("/api/auth/permissions");
  const result: PermissionsResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch permissions");
  }

  return result.data;
}

/**
 * Hook to fetch and cache user permissions
 * Uses React Query for automatic caching and refetching
 */
export function usePermissionsQuery() {
  return useQuery({
    queryKey: queryKeys.permissions(),
    queryFn: fetchPermissions,
    ...permissionsCacheConfig,
    retry: 1,
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
