"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { safeParseJson } from "@/lib/utils";

export const BOOTSTRAP_QUERY_KEY = ["auth", "bootstrap"] as const;

interface BootstrapData {
  session: { user: Record<string, unknown> };
  permissions: {
    exists: boolean;
    systemUserId: number | null;
    isSuperAdmin: boolean;
    roles?: unknown[];
    permissions?: unknown[];
    permissionStrings?: string[];
    message?: string;
  };
  dashboardAccess: {
    dashboards: Array<{ dashboardType: string; accessLevel: string; isActive: boolean }>;
    accessPoints: Array<{
      dashboardType: string;
      accessPointGroup: string;
      accessPointName: string;
      allowedActions: string[];
      isActive: boolean;
    }>;
  };
}

interface BootstrapResponse {
  success: boolean;
  data?: BootstrapData;
  error?: string;
  code?: string;
}

/**
 * Fetches /api/auth/bootstrap and seeds React Query cache for session, permissions, and dashboard-access
 * so the first paint (sidebar, nav) has data without 3 separate requests.
 */
export async function fetchBootstrapAndSeedCache(
  queryClient: ReturnType<typeof useQueryClient>
): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/bootstrap", {
      credentials: "include",
      cache: "no-store",
    });
    const text = await response.text();
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");

    if (!response.ok) {
      if (response.status === 401 || response.status === 404) return false;
      return false;
    }

    if (!isJson || !text.trim()) return false;

    const result = safeParseJson<BootstrapResponse>(text, "Bootstrap invalid JSON");
    if (!result.success || !result.data) return false;

    const { session, permissions, dashboardAccess } = result.data;

    queryClient.setQueryData(["auth", "session"], { session, permissions: permissions as unknown });
    queryClient.setQueryData(queryKeys.permissions(), permissions);
    queryClient.setQueryData(queryKeys.dashboardAccess(), dashboardAccess);

    return true;
  } catch {
    return false;
  }
}
