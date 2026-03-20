"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { authCacheConfig, sessionStatusCacheConfig } from "@/lib/cache-strategies";
import { safeParseJson } from "@/lib/utils";

interface SessionData {
  session: {
    user: {
      id: string;
      email: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
  permissions?: any;
  systemUser?: {
    id: number;
    systemUserId: string;
    fullName: string;
    email: string;
  } | null;
}

interface SessionStatus {
  authenticated: boolean;
  expired?: boolean;
  reason?: string;
  session?: {
    email: string;
    userId: string;
    sessionId?: string;
    timeRemaining?: number;
    timeRemainingFormatted?: string;
    daysRemaining?: number;
    sessionStartTime?: number;
    lastActivityTime?: number;
  };
}

interface SessionResponse {
  success: boolean;
  data?: SessionData;
  error?: string;
  code?: string;
}

interface SessionStatusResponse {
  success: boolean;
  authenticated: boolean;
  expired?: boolean;
  reason?: string;
  session?: SessionStatus["session"];
  error?: string;
}

/** Thrown when session API returns 503 (Supabase unreachable). Client should retry, not redirect to login. */
export const SESSION_SERVICE_UNAVAILABLE = "SESSION_SERVICE_UNAVAILABLE";

async function fetchSession(): Promise<SessionData> {
  const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let result: SessionResponse | null = null;
  if (text.trim() && isJson) {
    try {
      result = safeParseJson<SessionResponse>(text, "Invalid JSON");
    } catch {
      result = null;
    }
  }

  if (!result) {
    if (response.status === 503) {
      throw new Error(SESSION_SERVICE_UNAVAILABLE);
    }
    if (response.status === 401 || response.status === 403) {
      const params = new URLSearchParams();
      params.set("redirect", typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard");
      params.set("reason", "session_required");
      if (typeof window !== "undefined") {
        fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
          window.location.href = `/login?${params.toString()}`;
        });
        return new Promise(() => {});
      }
    }
    throw new Error("Session API returned invalid response");
  }

  if (!result.success || !result.data) {
    if (response.status === 503 && result.code === "SERVICE_UNAVAILABLE") {
      throw new Error(SESSION_SERVICE_UNAVAILABLE);
    }
    if (response.status === 401 && (result.code === "SESSION_INVALID" || result.code === "SESSION_REQUIRED")) {
      const params = new URLSearchParams();
      params.set("redirect", typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard");
      params.set("reason", result.code === "SESSION_INVALID" ? "session_invalid" : "session_required");
      if (typeof window !== "undefined") {
        fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
          window.location.href = `/login?${params.toString()}`;
        });
        return new Promise(() => {});
      }
    }
    throw new Error(result.error || "Not authenticated");
  }

  return result.data;
}

async function fetchSessionStatus(): Promise<SessionStatus> {
  const response = await fetch("/api/auth/session-status", { credentials: "include", cache: "no-store" });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let result: SessionStatusResponse | null = null;
  if (text.trim() && isJson) {
    try {
      result = safeParseJson<SessionStatusResponse>(text, "Invalid JSON");
    } catch {
      result = null;
    }
  }

  if (!result) {
    throw new Error("Session status API returned invalid response");
  }

  if (!result.success) {
    if (response.status === 401 && (result as { code?: string }).code === "SESSION_INVALID") {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams();
        params.set("redirect", window.location.pathname + window.location.search || "/dashboard");
        params.set("reason", "session_invalid");
        fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
          window.location.href = `/login?${params.toString()}`;
        });
        return new Promise<SessionStatus>(() => {});
      }
    }
    throw new Error(result.error || "Failed to fetch session status");
  }

  return {
    authenticated: result.authenticated,
    expired: result.expired,
    reason: result.reason,
    session: result.session,
  };
}

async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let result: { success?: boolean; error?: string } | null = null;
  if (text.trim() && contentType.includes("application/json")) {
    try {
      result = safeParseJson<{ success?: boolean; error?: string }>(text, "Invalid JSON");
    } catch {
      result = null;
    }
  }
  if (!result) {
    if (response.ok) return;
    throw new Error("Failed to logout");
  }
  if (!result.success) {
    throw new Error(result.error || "Failed to logout");
  }
}

/**
 * Hook to fetch current session data
 * Includes user info and permissions
 */
export function useSessionQuery() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: fetchSession,
    ...authCacheConfig,
    placeholderData: (previousData) => previousData,
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;
      return error instanceof Error && error.message === SESSION_SERVICE_UNAVAILABLE;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

/**
 * Hook to fetch session status
 * Returns authentication status, time remaining, etc.
 */
export function useSessionStatusQuery() {
  return useQuery({
    queryKey: ["auth", "session-status"],
    queryFn: fetchSessionStatus,
    ...sessionStatusCacheConfig,
    placeholderData: (previousData) => previousData,
    retry: false,
  });
}

/**
 * Hook to logout user
 * Invalidates all auth-related queries on success
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Invalidate all auth-related queries
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAccess() });
      
      // Clear all cached data
      queryClient.clear();
      
      // Clear map cache on logout
      if (typeof window !== "undefined") {
        import("@/lib/map-cache").then(({ mapCache }) => {
          mapCache.clearCache();
        }).catch(() => {
          // Ignore errors
        });
      }
      
      // Redirect to login page
      window.location.href = "/login";
    },
  });
}

/**
 * Convenience hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { data } = useSessionStatusQuery();
  return data?.authenticated ?? false;
}

/**
 * Convenience hook to get current user email
 */
export function useUserEmail(): string | null {
  const { data } = useSessionQuery();
  return data?.session?.user?.email ?? null;
}

/**
 * Convenience hook to get current user ID
 */
export function useUserId(): string | null {
  const { data } = useSessionQuery();
  return data?.session?.user?.id ?? null;
}
