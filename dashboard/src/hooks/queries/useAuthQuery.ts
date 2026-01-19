"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { authCacheConfig, sessionStatusCacheConfig } from "@/lib/cache-strategies";

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
}

interface SessionStatusResponse {
  success: boolean;
  authenticated: boolean;
  expired?: boolean;
  reason?: string;
  session?: SessionStatus["session"];
  error?: string;
}

async function fetchSession(): Promise<SessionData> {
  const response = await fetch("/api/auth/session");
  const result: SessionResponse = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Not authenticated");
  }

  return result.data;
}

async function fetchSessionStatus(): Promise<SessionStatus> {
  const response = await fetch("/api/auth/session-status");
  const result: SessionStatusResponse = await response.json();

  if (!result.success) {
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
  });

  const result = await response.json();

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
    retry: false, // Don't retry on auth failures
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
