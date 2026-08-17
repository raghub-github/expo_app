"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearPartnerStoreSelection } from "@/lib/partner-selected-store";
import {
  PARTNER_CROSS_TAB_LOGOUT_KEY,
  partnerLogoutLocal,
} from "@/lib/auth/partner-logout";
import { clearPushSessionDismissed } from "@/lib/browser-push/partner-push-state";
import {
  beginPartnerSessionBackgroundRefresh,
  endPartnerSessionBackgroundRefresh,
} from "@/lib/auth/partner-session-focus-gate";

interface MerchantSessionUser {
  id: string;
  email: string | null;
  phone?: string | null;
  name?: string | null;
  avatar_url?: string | null;
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
  /** Brand logo: `/api/attachments/proxy?key=...` from merchant_parents.store_logo */
  store_logo?: string | null;
}

export interface MerchantSessionContextValue {
  user: MerchantSessionUser | null;
  sessionStatus: MerchantSessionStatus | null;
  parent: MerchantParentSummary | null;
  isLoading: boolean;
  /** True while re-validating session after tab focus / visibility restore. */
  isRefreshing: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refetch: () => void;
}

const MerchantSessionContext = createContext<MerchantSessionContextValue | null>(null);

const FATAL_SESSION_CODES = new Set(["SESSION_INVALID", "DEVICE_SESSION_INVALID"]);

export function MerchantSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MerchantSessionUser | null>(null);
  const [sessionStatus, setSessionStatus] = useState<MerchantSessionStatus | null>(null);
  const [parent, setParent] = useState<MerchantParentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initialLoadRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastFetchAtRef = useRef(0);
  const lastUnavailableAtRef = useRef(0);
  const FOCUS_MIN_INTERVAL_MS = 30_000;
  const UNAVAILABLE_BACKOFF_MS = 20_000;

  const fetchSession = useCallback(async (options?: { background?: boolean; force?: boolean }) => {
    const background = options?.background === true;
    const force = options?.force === true;
    const now = Date.now();

    if (
      !force &&
      lastUnavailableAtRef.current > 0 &&
      now - lastUnavailableAtRef.current < UNAVAILABLE_BACKOFF_MS
    ) {
      return;
    }
    if (!force && background && now - lastFetchAtRef.current < FOCUS_MIN_INTERVAL_MS) {
      return;
    }
    if (inFlightRef.current) {
      await inFlightRef.current;
      return;
    }

    if (background) {
      beginPartnerSessionBackgroundRefresh();
      setIsRefreshing(true);
    }
    const run = (async () => {
      try {
        lastFetchAtRef.current = Date.now();
        // Single bootstrap call — avoids parallel getUser()/refresh-token races.
        const sessionRes = await fetch("/api/merchant-auth/merchant-session", {
          credentials: "include",
        });
        const sessionData = await sessionRes.json().catch(() => ({}));

        if (sessionRes.status === 503 || sessionData.code === "SERVICE_UNAVAILABLE") {
          lastUnavailableAtRef.current = Date.now();
          // Transient — keep prior state if any; do not treat as logged out.
          return;
        }

        lastUnavailableAtRef.current = 0;

        if (sessionRes.status === 401 && FATAL_SESSION_CODES.has(String(sessionData.code || ""))) {
          setUser(null);
          setParent(null);
          setSessionStatus({ authenticated: false, expired: true });
          return;
        }

        if (sessionData.success && sessionData.data?.user) {
          try {
            localStorage.removeItem(PARTNER_CROSS_TAB_LOGOUT_KEY);
          } catch {
            /* ignore */
          }
          setUser({
            id: sessionData.data.user.id,
            email: sessionData.data.user.email ?? null,
            phone: sessionData.data.user.phone ?? null,
            name: sessionData.data.user.name ?? null,
            avatar_url: sessionData.data.user.avatar_url ?? null,
          });
          setParent(sessionData.data.parent ?? null);
          setSessionStatus({
            authenticated: sessionData.authenticated !== false,
            expired: false,
            timeRemainingFormatted: sessionData.session?.timeRemainingFormatted,
          });
        } else {
          setUser(null);
          setParent(null);
          setSessionStatus({
            authenticated: false,
            expired: !!sessionData.expired,
          });
        }
      } catch {
        // Network blip — do not clear an existing session.
        lastUnavailableAtRef.current = Date.now();
      } finally {
        if (initialLoadRef.current) {
          setIsLoading(false);
          initialLoadRef.current = false;
        }
        if (background) {
          setIsRefreshing(false);
          endPartnerSessionBackgroundRefresh();
        }
      }
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchSession({ force: true });
  }, [fetchSession]);

  // Re-validate session when the tab regains focus so downstream queries don't
  // hit /api/* with stale cookies while Supabase refresh is still in flight.
  useEffect(() => {
    const refresh = () => {
      void fetchSession({ background: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    // Do not beginPartnerSessionBackgroundRefresh here — begin only when
    // fetchSession actually starts work (avoids unbalanced counter + 8s waits).
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSession]);

  // Synchronize logout across tabs (storage event fires in other tabs only).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PARTNER_CROSS_TAB_LOGOUT_KEY || e.newValue == null) return;
      clearPartnerStoreSelection();
      clearPushSessionDismissed();
      setUser(null);
      setSessionStatus(null);
      setParent(null);
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      if (path !== "/auth" && path !== "/auth/login") {
        window.location.href = "/auth";
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const logout = useCallback(async () => {
    await partnerLogoutLocal({ redirectToLogin: true, clearStoreSelection: true });
    setUser(null);
    setSessionStatus(null);
    setParent(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      sessionStatus,
      parent,
      isLoading,
      isRefreshing,
      // Prefer user presence; sessionStatus.authenticated is soft partner_* metadata.
      isAuthenticated: !!user && sessionStatus?.authenticated !== false,
      logout,
      refetch: () => {
        void fetchSession({ background: true, force: true });
      },
    }),
    [user, sessionStatus, parent, isLoading, isRefreshing, logout, fetchSession]
  );

  return (
    <MerchantSessionContext.Provider value={value}>{children}</MerchantSessionContext.Provider>
  );
}

export function useMerchantSession(): MerchantSessionContextValue | null {
  return useContext(MerchantSessionContext);
}

/** Gate store-scoped React Query hooks until merchant session is ready (avoids focus 401s). */
export function usePartnerMerchantQueriesEnabled(storeId?: string | null): boolean {
  const session = useMerchantSession();
  if (!storeId) return false;
  if (!session) return false;
  // Once authenticated, keep queries enabled during background session refresh so
  // cached dashboard data paints immediately (stale-while-revalidate).
  if (session.isAuthenticated) return true;
  if (session.isLoading) return false;
  return false;
}
