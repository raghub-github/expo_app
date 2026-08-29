"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { useBrowserPathname } from "@/hooks/tickets/useBrowserPathname";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  cleanDashboardHref,
  hasReachedNavTarget,
  isDashboardNavAlreadyAtTarget,
} from "@/lib/navigation/dashboard-nav-transition";

interface CurrentRouteContextValue {
  /** True while a sidebar/right-rail navigation overlay is in flight. */
  isNavigating: boolean;
  /** Target href for in-flight navigation (overlay only — not for menu active state). */
  pendingNavHref: string | null;
  startNavigation: (href: string) => void;
  clearNavigation: () => void;
}

const CurrentRouteContext = createContext<CurrentRouteContextValue | null>(null);

/**
 * Cold RSC compiles in Next.js dev commonly take 10–30s for heavy modules
 * (tickets, merchants, etc.). Keep overlay long enough to avoid false timeouts
 * that race a successful navigation finishing around the old 12s mark.
 */
const NAVIGATION_TIMEOUT_MS = 60_000;

function browserPathname(): string {
  if (typeof window === "undefined") return "";
  return cleanDashboardHref(window.location.pathname);
}

export function CurrentRouteProvider({ children }: { children: React.ReactNode }) {
  const pathname = useAppPathname();
  /** Live window.location pathname — settles overlays when usePathname lags. */
  const liveBrowserPathname = useBrowserPathname();
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  /** Pathname when the current pending intent started. */
  const navFromPathRef = useRef<string | null>(null);
  const navGenerationRef = useRef(0);
  const pendingNavHrefRef = useRef<string | null>(null);

  const clearNavigation = useCallback(() => {
    navGenerationRef.current += 1;
    navFromPathRef.current = null;
    pendingNavHrefRef.current = null;
    setPendingNavHref(null);
  }, []);

  const settlePendingIfResolved = useCallback((pathCandidate: string) => {
    const pending = pendingNavHrefRef.current;
    if (pending == null) return false;
    const path = cleanDashboardHref(pathCandidate);
    const from = navFromPathRef.current;

    // Still on the origin page — wait for URL to change.
    if (from != null && path === from) return false;

    if (hasReachedNavTarget(path, pending)) {
      navFromPathRef.current = null;
      pendingNavHrefRef.current = null;
      setPendingNavHref(null);
      return true;
    }

    // Left the origin but did not land on the pending target (back/forward,
    // redirect, or a competing navigation that settled elsewhere).
    console.warn("[dashboard-nav] Clearing stale pending navigation", {
      path,
      pending,
      from,
    });
    navFromPathRef.current = null;
    pendingNavHrefRef.current = null;
    setPendingNavHref(null);
    return true;
  }, []);

  const startNavigation = useCallback(
    (href: string) => {
      const target = cleanDashboardHref(href);
      const current = cleanDashboardHref(pathname);

      // Never invent pending state for a no-op same-route click.
      if (isDashboardNavAlreadyAtTarget(current, target)) return;

      // Same in-flight target: keep overlay unless the URL never actually moved
      // (nested Super Admin layouts can no-op the first router.push).
      if (pendingNavHrefRef.current === target) {
        const loc =
          typeof window !== "undefined" ? cleanDashboardHref(window.location.pathname) : current;
        if (loc === target || current === target) return;
      }

      // Latest click wins — replace any previous pending destination.
      navGenerationRef.current += 1;
      navFromPathRef.current = current;
      pendingNavHrefRef.current = target;
      setPendingNavHref(target);
    },
    [pathname]
  );

  // Resolve / abandon pending state from App Router pathname and live browser URL.
  useLayoutEffect(() => {
    if (settlePendingIfResolved(pathname)) return;
    if (liveBrowserPathname) settlePendingIfResolved(liveBrowserPathname);
  }, [pathname, liveBrowserPathname, pendingNavHref, settlePendingIfResolved]);

  // Browser back/forward must never leave a stuck overlay.
  useEffect(() => {
    const onPopState = () => {
      if (pendingNavHrefRef.current == null) return;
      // Prefer settling from the real URL; fall back to a hard clear.
      if (!settlePendingIfResolved(browserPathname())) {
        clearNavigation();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearNavigation, settlePendingIfResolved]);

  // Soft-nav failures / hung RSC: drop overlay so UI never stays inconsistent.
  // Do not abort <Link> navigation — only clear pending UI state.
  useEffect(() => {
    if (!pendingNavHref) return;
    const generation = navGenerationRef.current;
    const target = pendingNavHref;
    const timer = window.setTimeout(() => {
      if (navGenerationRef.current !== generation) return;
      if (pendingNavHrefRef.current !== target) return;

      // URL may already match while usePathname has not re-rendered yet.
      if (settlePendingIfResolved(browserPathname())) return;

      console.warn(
        "[dashboard-nav] Navigation overlay timed out (Link may still complete):",
        target,
        "from:",
        navFromPathRef.current,
        "location:",
        browserPathname()
      );
      navFromPathRef.current = null;
      pendingNavHrefRef.current = null;
      setPendingNavHref(null);
    }, NAVIGATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingNavHref, settlePendingIfResolved]);

  const value = useMemo(
    () => ({
      isNavigating: pendingNavHref != null,
      pendingNavHref,
      startNavigation,
      clearNavigation,
    }),
    [pendingNavHref, startNavigation, clearNavigation]
  );

  return <CurrentRouteContext.Provider value={value}>{children}</CurrentRouteContext.Provider>;
}

export function useCurrentRoute() {
  return useContext(CurrentRouteContext);
}
