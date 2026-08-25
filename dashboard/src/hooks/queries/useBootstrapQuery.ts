"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { safeParseJson } from "@/lib/utils";
import { saveBootstrapToStorage } from "@/lib/dashboard-bootstrap-storage";
import { isHardSessionDeathCode } from "@/lib/auth/session-errors";
import { redirectToLoginOnSessionExpired } from "@/lib/auth/redirect-to-login";

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
  const maxAttempts = 3;
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch("/api/auth/bootstrap", {
        credentials: "include",
        cache: "no-store",
      });
      const text = await response.text();
      const isJson = (response.headers.get("content-type") ?? "").includes("application/json");

      if (!response.ok) {
        if (response.status === 401 && isJson && text.trim()) {
          try {
            const errBody = safeParseJson<{ code?: string }>(text, "Bootstrap error");
            if (isHardSessionDeathCode(errBody?.code)) {
              redirectToLoginOnSessionExpired({ reason: errBody.code ?? "session_invalid" });
              return false;
            }
            // SESSION_REQUIRED is a compile/cookie-miss race — retry like 503.
            if (errBody?.code === "SESSION_REQUIRED" && attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 400 * attempt));
              continue;
            }
          } catch {
            /* non-JSON 401 */
          }
          return false;
        }
        if (response.status === 404) return false;
        // Refresh-token races / transient Supabase → 503: retry before giving up.
        if (
          (response.status === 503 || response.status === 429) &&
          attempt < maxAttempts
        ) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        return false;
      }

      if (!isJson || !text.trim()) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        return false;
      }

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
      const seededUserId =
        typeof (permissions as { systemUserId?: unknown })?.systemUserId === "number"
          ? (permissions as { systemUserId: number }).systemUserId
          : null;
      queryClient.setQueryData(queryKeys.dashboardAccess(seededUserId), dashboardAccess);
      // Also seed unscoped key for invalidateQueries prefix compatibility.
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
    }
    return false;
  } catch {
    return false;
  }
}
