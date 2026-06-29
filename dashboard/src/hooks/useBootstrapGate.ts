"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { useEffect, useState } from "react";

import type { QueryClient } from "@tanstack/react-query";
import { fetchBootstrapAndSeedCache } from "@/hooks/queries/useBootstrapQuery";
import { loadBootstrapFromStorage } from "@/lib/dashboard-bootstrap-storage";
import { consumeForceBootstrapRefresh } from "@/lib/dashboard-auth-client-state";
import { queryKeys } from "@/lib/queryKeys";
import { syncServerSessionCookies } from "@/lib/auth/sync-server-session";
import { hydrateBrowserSupabaseFromCookies } from "@/lib/auth/hydrate-browser-supabase";

/** Module-level dedupe so dashboard + order routes never double-fetch bootstrap. */
let bootstrapInFlight: Promise<void> | null = null;

const BOOTSTRAP_MAX_AGE_MS = 10 * 60 * 1000;
/** Skip network bootstrap revalidation when local cache is newer than this. */
const BOOTSTRAP_REVALIDATE_MIN_AGE_MS = 5 * 60 * 1000;

function scheduleBootstrapRevalidate(queryClient: QueryClient): void {
  if (bootstrapInFlight) return;
  bootstrapInFlight = fetchBootstrapAndSeedCache(queryClient)
    .catch(() => false)
    .then(() => undefined)
    .finally(() => {
      bootstrapInFlight = null;
    });
}

declare global {
  interface Window {
    __gatiBootstrapDone?: boolean;
  }
}

/**
 * Seeds auth session from React Query cache or localStorage, then optionally
 * revalidates bootstrap in the background. Runs once per app shell mount.
 *
 * New tabs must NOT rotate Supabase refresh tokens or re-hit bootstrap when
 * another tab already hydrated auth recently — that was reloading other tabs.
 */
export function useBootstrapGate(queryClient: QueryClient): boolean {
  const pathname = useAppPathname() ?? "";
  const isStandaloneOrderRoute = pathname.split("?")[0].split("#")[0].startsWith("/order");

  const [authReady, setAuthReady] = useState(() => {
    if (typeof window !== "undefined" && window.__gatiBootstrapDone) return true;
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.__gatiBootstrapDone) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const forceRefresh = consumeForceBootstrapRefresh();

      const stored = forceRefresh
        ? null
        : loadBootstrapFromStorage<{
            session: { user: Record<string, unknown> };
            permissions: unknown;
            dashboardAccess: unknown;
            systemUser?: { id: number; systemUserId: string; fullName: string; email: string } | null;
          }>(BOOTSTRAP_MAX_AGE_MS);

      const bootstrapAgeMs = stored ? Date.now() - stored.storedAt : Number.POSITIVE_INFINITY;
      const bootstrapFresh = !forceRefresh && bootstrapAgeMs < BOOTSTRAP_REVALIDATE_MIN_AGE_MS;

      const cached = forceRefresh ? null : queryClient.getQueryData(["auth", "session"]);
      if (cached != null) {
        if (!cancelled) {
          window.__gatiBootstrapDone = true;
          setAuthReady(true);
        }
        return;
      }

      if (stored?.data) {
        const { session, permissions, dashboardAccess, systemUser } = stored.data;
        queryClient.setQueryData(["auth", "session"], {
          session,
          permissions,
          systemUser: systemUser ?? null,
        });
        queryClient.setQueryData(queryKeys.permissions(), permissions as unknown);
        queryClient.setQueryData(queryKeys.dashboardAccess(), dashboardAccess as unknown);

        if (bootstrapFresh || (isStandaloneOrderRoute && bootstrapAgeMs < BOOTSTRAP_MAX_AGE_MS)) {
          if (!cancelled) {
            window.__gatiBootstrapDone = true;
            setAuthReady(true);
          }
          return;
        }
      }

      // Order page: ensure httpOnly cookies exist before client API calls, without full bootstrap revalidation.
      if (isStandaloneOrderRoute && stored?.data) {
        await syncServerSessionCookies();
        if (!cancelled) {
          window.__gatiBootstrapDone = true;
          setAuthReady(true);
        }
        return;
      }

      // Fresh login already POSTed tokens to set-cookie; re-sync would replay stale
      // localStorage refresh tokens and trigger refresh_token_not_found errors.
      if (!bootstrapFresh && !forceRefresh) {
        await syncServerSessionCookies();
        void hydrateBrowserSupabaseFromCookies();
      }

      if (stored?.data) {
        scheduleBootstrapRevalidate(queryClient);
        void (bootstrapInFlight ?? Promise.resolve()).finally(() => {
          if (!cancelled) {
            window.__gatiBootstrapDone = true;
            setAuthReady(true);
          }
        });
        return;
      }

      if (!stored?.data) {
        if (isStandaloneOrderRoute) {
          await syncServerSessionCookies();
          void hydrateBrowserSupabaseFromCookies();
          if (!bootstrapInFlight) {
            scheduleBootstrapRevalidate(queryClient);
          }
          if (!cancelled) {
            window.__gatiBootstrapDone = true;
            setAuthReady(true);
          }
          return;
        }

        if (!bootstrapInFlight) {
          bootstrapInFlight = fetchBootstrapAndSeedCache(queryClient)
            .catch(() => false)
            .then(() => undefined)
            .finally(() => {
              bootstrapInFlight = null;
            });
        }
        void bootstrapInFlight.finally(() => {
          if (!cancelled) {
            window.__gatiBootstrapDone = true;
            setAuthReady(true);
          }
        });
        return;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [queryClient, isStandaloneOrderRoute]);

  return authReady;
}

