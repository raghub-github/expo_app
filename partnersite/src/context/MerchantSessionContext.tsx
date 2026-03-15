"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface MerchantSessionUser {
  id: string;
  email: string | null;
  phone?: string | null;
}

interface MerchantSessionStatus {
  authenticated: boolean;
  expired?: boolean;
  timeRemainingFormatted?: string;
}

/** Parent summary from merchant-session; when can_register_child is false, show blocked banner. */
export interface MerchantParentSummary {
  id: number;
  parent_merchant_id: string;
  approval_status?: string;
  registration_status?: string;
  is_active?: boolean;
  can_register_child: boolean;
  block_message?: string;
}

interface MerchantSessionContextValue {
  user: MerchantSessionUser | null;
  sessionStatus: MerchantSessionStatus | null;
  parent: MerchantParentSummary | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const MerchantSessionContext = createContext<MerchantSessionContextValue | null>(null);

export function MerchantSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MerchantSessionUser | null>(null);
  const [sessionStatus, setSessionStatus] = useState<MerchantSessionStatus | null>(null);
  const [parent, setParent] = useState<MerchantParentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      // Fetch sequentially to avoid two requests using the same Supabase refresh token.
      // Supabase refresh tokens are single-use; parallel calls can cause "Refresh Token Not Found".
      const sessionRes = await fetch("/api/merchant-auth/merchant-session");
      const sessionData = await sessionRes.json();
      const statusRes = await fetch("/api/merchant-auth/merchant-session-status");
      const statusData = await statusRes.json();
      if (sessionData.success && sessionData.data?.user) {
        setUser({
          id: sessionData.data.user.id,
          email: sessionData.data.user.email ?? null,
          phone: sessionData.data.user.phone ?? null,
        });
        setParent(sessionData.data.parent ?? null);
      } else {
        setUser(null);
        setParent(null);
      }
      if (statusData.success) {
        setSessionStatus({
          authenticated: !!statusData.authenticated,
          expired: statusData.expired,
          timeRemainingFormatted: statusData.session?.timeRemainingFormatted,
        });
      } else {
        setSessionStatus(null);
      }
    } catch {
      setUser(null);
      setParent(null);
      setSessionStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSessionStatus(null);
    setParent(null);
    window.location.href = "/auth/login";
  }, []);

  const value = useMemo(
    () => ({
      user,
      sessionStatus,
      parent,
      isLoading,
      isAuthenticated: !!sessionStatus?.authenticated && !!user,
      logout,
      refetch: fetchSession,
    }),
    [user, sessionStatus, parent, isLoading, logout, fetchSession]
  );

  return (
    <MerchantSessionContext.Provider value={value}>
      {children}
    </MerchantSessionContext.Provider>
  );
}

export function useMerchantSession(): MerchantSessionContextValue | null {
  return useContext(MerchantSessionContext);
}
