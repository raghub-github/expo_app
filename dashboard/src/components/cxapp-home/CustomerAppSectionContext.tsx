"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { geoAdminApi } from "@/store/api/geoAdminApi";
import { queryKeys } from "@/lib/queryKeys";
import { fetchUserAppCategoriesBootstrap } from "@/lib/user-app-categories/fetch-bootstrap";
import type { AppDispatch } from "@/store/store";

export const APP_CATEGORY_HREF = "/dashboard/super-admin/customer-app-categories";
export const CXAPP_HOME_HREF = "/dashboard/super-admin/cxapp-home";

export type CustomerAppSectionTab = "app-category" | "cxapp-home";

export function tabFromCustomerAppPath(pathname: string): CustomerAppSectionTab {
  return pathname === CXAPP_HOME_HREF || pathname.startsWith(`${CXAPP_HOME_HREF}/`)
    ? "cxapp-home"
    : "app-category";
}

export function isCxAppHomeStateDetailPath(pathname: string): boolean {
  return /^\/dashboard\/super-admin\/cxapp-home\/[^/]+\/?$/.test(pathname);
}

type Ctx = {
  /** Visible tab — updates on click before the route finishes. */
  activeTab: CustomerAppSectionTab;
  routeTab: CustomerAppSectionTab;
  switchTab: (tab: CustomerAppSectionTab) => void;
  warmTab: (tab: CustomerAppSectionTab) => void;
};

const CustomerAppSectionCtx = createContext<Ctx | null>(null);

export function useCustomerAppSection(): Ctx {
  const ctx = useContext(CustomerAppSectionCtx);
  if (!ctx) {
    throw new Error("useCustomerAppSection must be used within CustomerAppSectionProvider");
  }
  return ctx;
}

export function useCustomerAppSectionOptional(): Ctx | null {
  return useContext(CustomerAppSectionCtx);
}

export function CustomerAppSectionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useAppPathname();
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const routeTab = tabFromCustomerAppPath(pathname);
  const [pendingTab, setPendingTab] = useState<CustomerAppSectionTab | null>(null);

  useEffect(() => {
    if (pendingTab != null && pendingTab === routeTab) {
      setPendingTab(null);
    }
  }, [pendingTab, routeTab]);

  const activeTab = pendingTab ?? routeTab;

  const warmTab = useCallback(
    (tab: CustomerAppSectionTab) => {
      if (tab === "cxapp-home") {
        router.prefetch(CXAPP_HOME_HREF);
        dispatch(geoAdminApi.util.prefetch("geoStates", undefined, { force: false }));
      } else {
        router.prefetch(APP_CATEGORY_HREF);
        void queryClient.prefetchQuery({
          queryKey: queryKeys.admin.userAppCategories("FOOD"),
          queryFn: () => fetchUserAppCategoriesBootstrap("FOOD"),
          staleTime: 10 * 60 * 1000,
        });
      }
    },
    [dispatch, queryClient, router]
  );

  useEffect(() => {
    warmTab("app-category");
    warmTab("cxapp-home");
  }, [warmTab]);

  const switchTab = useCallback(
    (tab: CustomerAppSectionTab) => {
      const href = tab === "cxapp-home" ? CXAPP_HOME_HREF : APP_CATEGORY_HREF;
      if (pathname === href) {
        setPendingTab(null);
        return;
      }
      setPendingTab(tab);
      warmTab(tab);
      router.replace(href);
    },
    [pathname, router, warmTab]
  );

  const value = useMemo(
    () => ({ activeTab, routeTab, switchTab, warmTab }),
    [activeTab, routeTab, switchTab, warmTab]
  );

  return (
    <CustomerAppSectionCtx.Provider value={value}>{children}</CustomerAppSectionCtx.Provider>
  );
}
