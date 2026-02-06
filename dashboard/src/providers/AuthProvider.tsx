"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import {
  useSessionQuery,
  useSessionStatusQuery,
  useLogout,
} from "@/hooks/queries/useAuthQuery";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";

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

interface AuthContextValue {
  /** Current user from session (null when not authenticated or loading) */
  user: SessionUser | null;
  /** Session status: time remaining, expired, etc. */
  sessionStatus: SessionStatus | null;
  /** Permissions and roles (null until loaded) */
  permissions: PermissionsData | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sessionQuery = useSessionQuery();
  const sessionStatusQuery = useSessionStatusQuery();
  const permissionsQuery = usePermissionsQuery();
  const logoutMutation = useLogout();

  const user = sessionQuery.data?.session?.user ?? null;
  const sessionStatus: SessionStatus | null = sessionStatusQuery.data
    ? {
        authenticated: sessionStatusQuery.data.authenticated,
        expired: sessionStatusQuery.data.expired,
        reason: sessionStatusQuery.data.reason,
        session: sessionStatusQuery.data.session,
      }
    : null;
  const permissions = permissionsQuery.data ?? null;

  const isLoading =
    (sessionQuery.isLoading && !sessionQuery.data) ||
    (permissionsQuery.isLoading && !permissionsQuery.data);
  const isAuthenticated = Boolean(sessionStatus?.authenticated && user);
  const isError = sessionQuery.isError || permissionsQuery.isError;
  const error = sessionQuery.error || permissionsQuery.error || null;

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  const refetch = useCallback(() => {
    sessionQuery.refetch();
    sessionStatusQuery.refetch();
    permissionsQuery.refetch();
  }, [sessionQuery, sessionStatusQuery, permissionsQuery]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionStatus,
      permissions,
      isLoading,
      isAuthenticated,
      isError,
      error: error instanceof Error ? error : null,
      logout,
      refetch,
    }),
    [
      user,
      sessionStatus,
      permissions,
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
