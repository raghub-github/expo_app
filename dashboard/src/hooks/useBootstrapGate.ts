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
    // Never leave order/dashboard pages waiting forever on a hung sync/bootstrap.
    const safetyTimer = window.setTimeout(() => {
      if (cancelled || window.__gatiBootstrapDone) return;
      window.__gatiBootstrapDone = true;
      setAuthReady(true);
    }, 8_000);

    const markReady = () => {
      if (cancelled) return;
      window.__gatiBootstrapDone = true;
      setAuthReady(true);
    };

    const run = async () => {
      try {
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

        const cached = forceRefresh ? null : queryClient.getQueryData<{
          session?: unknown;
          permissions?: unknown;
          systemUser?: { systemUserId?: string } | null;
        }>(["auth", "session"]);
        const cachedHasSystemUserId = Boolean(cached?.systemUser?.systemUserId?.trim());
        if (cached != null && cachedHasSystemUserId) {
          markReady();
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
          const seededUserId =
            typeof (permissions as { systemUserId?: unknown })?.systemUserId === "number"
              ? (permissions as { systemUserId: number }).systemUserId
              : null;
          queryClient.setQueryData(
            queryKeys.dashboardAccess(seededUserId),
            dashboardAccess as unknown
          );
          queryClient.setQueryData(queryKeys.dashboardAccess(), dashboardAccess as unknown);

          const storedHasSystemUserId = Boolean(systemUser?.systemUserId?.trim());
          if (
            storedHasSystemUserId &&
            (bootstrapFresh || (isStandaloneOrderRoute && bootstrapAgeMs < BOOTSTRAP_MAX_AGE_MS))
          ) {
            markReady();
            // Soft revalidate in background if cache is aging out of the fresh window.
            if (!bootstrapFresh) {
              scheduleBootstrapRevalidate(queryClient);
            }
            return;
          }
        }

        // Order page: ensure httpOnly cookies exist before client API calls.
        // If systemUserId is missing from cache, still fetch bootstrap so header stays correct.
        if (isStandaloneOrderRoute && stored?.data?.systemUser?.systemUserId) {
          await syncServerSessionCookies();
          markReady();
          scheduleBootstrapRevalidate(queryClient);
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
          void (bootstrapInFlight ?? Promise.resolve()).finally(markReady);
          return;
        }

        if (!stored?.data) {
          if (isStandaloneOrderRoute) {
            await syncServerSessionCookies();
            void hydrateBrowserSupabaseFromCookies();
            if (!bootstrapInFlight) {
              scheduleBootstrapRevalidate(queryClient);
            }
            // Wait for bootstrap so OrderHeader always gets systemUserId (not empty "U").
            void (bootstrapInFlight ?? Promise.resolve()).finally(markReady);
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
          void bootstrapInFlight.finally(markReady);
          return;
        }
      } catch {
        markReady();
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [queryClient, isStandaloneOrderRoute]);

  // When the tab is focused again, soft-revalidate bootstrap so superadmin access
  // changes show up without requiring a full re-login.
  useEffect(() => {
    if (!authReady || isStandaloneOrderRoute) return;
    const onFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      scheduleBootstrapRevalidate(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAccess() });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [authReady, isStandaloneOrderRoute, queryClient]);

  return authReady;
}

