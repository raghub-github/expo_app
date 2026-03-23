"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
interface SessionUser {
  id: string;
  email: string;
  [key: string]: unknown;
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

interface PermissionsData {
  exists: boolean;
  systemUserId: number | null;
  isSuperAdmin: boolean;
  roles?: string[];
  permissions?: string[];
  message?: string;
}

export interface SystemUserSummary {
  id: number;
  systemUserId: string;
  fullName: string;
  email: string;
}
interface AuthContextValue {
  /** True once bootstrap/auth state has been resolved and queries may run */
  authReady: boolean;
  /** Current user from session (null when not authenticated or loading) */
  user: SessionUser | null;
  /** Session status: time remaining, expired, etc. */
  sessionStatus: SessionStatus | null;
  /** Permissions and roles (null until loaded) */
  permissions: PermissionsData | null;
  /** Canonical identity from system_users (bootstrap/session; stable for profile header) */
  systemUser: SystemUserSummary | null;
  /** True when session or permissions are loading and we have no cached data */
  isLoading: boolean;
  /** True when session query resolved and user is authenticated */
  isAuthenticated: boolean;
  /** Session or permissions fetch error */
  isError: boolean;
  error: Error | null;
  /** Log out and redirect to login */
  logout: () => void;
  /** Refetch session and permissions (e.g. after a critical action) */
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  authReady,
}: {
  children: React.ReactNode;
  authReady?: boolean;
}) {
  const queryClient = useQueryClient();

  const bootstrapSession = queryClient.getQueryData<{
    session?: { user?: SessionUser };
    permissions?: PermissionsData;
    systemUser?: SystemUserSummary | null;
  }>(["auth", "session"]);

  const user = bootstrapSession?.session?.user ?? null;
  const permissions = (bootstrapSession?.permissions as PermissionsData | undefined) ?? null;
  const systemUser = bootstrapSession?.systemUser ?? null;

  const isAuthenticated = Boolean(user);
  const isLoading = !authReady && !user;
  const isError = false;
  const error: Error | null = null;

  const sessionStatus: SessionStatus | null = user
    ? {
        authenticated: true,
        expired: false,
        reason: undefined,
        session: user.email
          ? {
              email: user.email,
              userId: user.id,
            }
          : undefined,
      }
    : null;

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  const refetch = useCallback(() => {
    // Re-run bootstrap to refresh auth state
    queryClient.invalidateQueries({ queryKey: ["auth", "bootstrap"] });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady: Boolean(authReady || user),
      user,
      sessionStatus,
      permissions,
      systemUser,
      isLoading,
      isAuthenticated,
      isError,
      error,
      logout,
      refetch,
    }),
    [
      user,
      sessionStatus,
      permissions,
      systemUser,
      isLoading,
      isAuthenticated,
      isError,
      error,
      logout,
      refetch,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/** Safe hook that returns null if used outside AuthProvider (e.g. on login page) */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
