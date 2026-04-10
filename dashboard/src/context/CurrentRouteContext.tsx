"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

interface CurrentRouteContextValue {
  currentRoute: string;
  setCurrentRoute: (route: string) => void;
}

const CurrentRouteContext = createContext<CurrentRouteContextValue | null>(null);

function stripHashQuery(s: string) {
  return s.split("?")[0].split("#")[0];
}

/** Same rules as dashboard layout `pendingNavHref` / sidebar “arrived at target”. */
function pathMatchesNavigationTarget(pathname: string, target: string) {
  const cleanPath = stripHashQuery(pathname);
  const cleanTarget = stripHashQuery(target);
  return (
    cleanPath === cleanTarget ||
    (cleanTarget !== "/dashboard" && cleanPath.startsWith(cleanTarget + "/"))
  );
}

export function CurrentRouteProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [optimisticTarget, setOptimisticTarget] = useState<string | null>(null);

  useLayoutEffect(() => {
    setOptimisticTarget((prev) => {
      if (prev == null) return null;
      return pathMatchesNavigationTarget(pathname, prev) ? null : prev;
    });
  }, [pathname]);

  const currentRoute = optimisticTarget ?? pathname;

  const setCurrentRoute = useCallback((route: string) => {
    setOptimisticTarget(route);
  }, []);

  const value = useMemo(
    () => ({
      currentRoute,
      setCurrentRoute,
    }),
    [currentRoute, setCurrentRoute]
  );

  return <CurrentRouteContext.Provider value={value}>{children}</CurrentRouteContext.Provider>;
}

export function useCurrentRoute() {
  return useContext(CurrentRouteContext);
}
