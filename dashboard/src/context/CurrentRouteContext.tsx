"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

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

import { hasReachedNavTarget } from "@/lib/navigation/dashboard-nav-transition";

interface CurrentRouteContextValue {
  /** True while a sidebar navigation is in flight (global overlay covers workspace). */
  isNavigating: boolean;
  /** Target href for sidebar highlight during navigation. */
  pendingNavHref: string | null;
  startNavigation: (href: string) => void;
  clearNavigation: () => void;
}

const CurrentRouteContext = createContext<CurrentRouteContextValue | null>(null);

function stripHashQuery(s: string) {
  return s.split("?")[0].split("#")[0];
}

const NAVIGATION_TIMEOUT_MS = 12_000;

export function CurrentRouteProvider({ children }: { children: React.ReactNode }) {
  const pathname = useAppPathname();
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const navGenerationRef = useRef(0);

  const clearNavigation = useCallback(() => {
    setPendingNavHref(null);
  }, []);

  const startNavigation = useCallback((href: string) => {
    navGenerationRef.current += 1;
    setPendingNavHref(stripHashQuery(href));
  }, []);

  useLayoutEffect(() => {
    if (pendingNavHref == null) return;
    if (hasReachedNavTarget(pathname, pendingNavHref)) {
      setPendingNavHref(null);
    }
  }, [pathname, pendingNavHref]);

  useEffect(() => {
    if (!pendingNavHref) return;
    const generation = navGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (navGenerationRef.current === generation) {
        setPendingNavHref(null);
      }
    }, NAVIGATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingNavHref]);

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

