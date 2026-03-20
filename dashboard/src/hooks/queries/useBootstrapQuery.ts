"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { safeParseJson } from "@/lib/utils";
import { saveBootstrapToStorage } from "@/lib/dashboard-bootstrap-storage";

export const BOOTSTRAP_QUERY_KEY = ["auth", "bootstrap"] as const;

export interface BootstrapSystemUser {
  id: number;
  systemUserId: string;
  fullName: string;
  email: string;
}

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
  systemUser?: BootstrapSystemUser | null;
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
  status?: string;
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

    const { session, permissions, dashboardAccess, systemUser } = result.data;

    // Seed React Query in-memory cache so the first dashboard paint has data.
    queryClient.setQueryData(["auth", "session"], {
      session,
      permissions: permissions as unknown,
      systemUser: systemUser ?? null,
    });
    queryClient.setQueryData(queryKeys.permissions(), permissions);
    queryClient.setQueryData(queryKeys.dashboardAccess(), dashboardAccess);

    // Persist a copy in localStorage for the next navigation so we can render
    // instantly from cache and then revalidate in the background (SWR-style).
    saveBootstrapToStorage<BootstrapData>({
      session,
      permissions,
      dashboardAccess,
      systemUser: systemUser ?? null,
    });

    return true;
  } catch {
    return false;
  }
}
