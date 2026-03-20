"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

interface CurrentRouteContextValue {
  currentRoute: string;
  setCurrentRoute: (route: string) => void;
}

const CurrentRouteContext = createContext<CurrentRouteContextValue | null>(null);

export function CurrentRouteProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentRoute, setCurrentRoute] = useState(pathname);

  useEffect(() => {
    setCurrentRoute(pathname);
  }, [pathname]);

  const value = useMemo(
    () => ({
      currentRoute,
      setCurrentRoute,
    }),
    [currentRoute]
  );

  return <CurrentRouteContext.Provider value={value}>{children}</CurrentRouteContext.Provider>;
}

export function useCurrentRoute() {
  return useContext(CurrentRouteContext);
}

