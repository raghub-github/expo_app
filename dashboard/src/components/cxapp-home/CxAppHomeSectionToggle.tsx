"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { geoAdminApi } from "@/store/api/geoAdminApi";
import type { AppDispatch } from "@/store/store";

const APP_CATEGORY_HREF = "/dashboard/super-admin/customer-app-categories";
const CXAPP_HOME_HREF = "/dashboard/super-admin/cxapp-home";

type TabId = "app-category" | "cxapp-home";

/**
 * Single-click tab switch between App Category and CXApp Home.
 * Prefetches the route + geo states so the list paints from cache immediately.
 */
export function CxAppHomeSectionToggle() {
  const router = useRouter();
  const pathname = useAppPathname();
  const dispatch = useDispatch<AppDispatch>();

  const active: TabId = pathname.startsWith(CXAPP_HOME_HREF) ? "cxapp-home" : "app-category";

  const warmCxAppHome = useCallback(() => {
    router.prefetch(CXAPP_HOME_HREF);
    dispatch(geoAdminApi.util.prefetch("geoStates", undefined, { force: false }));
  }, [dispatch, router]);

  const warmAppCategory = useCallback(() => {
    router.prefetch(APP_CATEGORY_HREF);
  }, [router]);

  useEffect(() => {
    warmCxAppHome();
    warmAppCategory();
  }, [warmAppCategory, warmCxAppHome]);

  const go = useCallback(
    (href: string) => {
      if (pathname === href || pathname.startsWith(`${href}/`)) return;
      if (href === CXAPP_HOME_HREF) warmCxAppHome();
      else warmAppCategory();
      // Immediate push — avoid startTransition so the next route isn't deferred.
      router.push(href);
    },
    [pathname, router, warmAppCategory, warmCxAppHome]
  );

  const tabClass = (id: TabId) =>
    active === id
      ? "rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white"
      : "cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50";

  return (
    <div
      className="relative z-30 inline-flex shrink-0 items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
      role="tablist"
      aria-label="Customer app section"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "app-category"}
        className={tabClass("app-category")}
        onMouseEnter={warmAppCategory}
        onFocus={warmAppCategory}
        onClick={() => go(APP_CATEGORY_HREF)}
      >
        App Category
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "cxapp-home"}
        className={tabClass("cxapp-home")}
        onMouseEnter={warmCxAppHome}
        onFocus={warmCxAppHome}
        onClick={() => go(CXAPP_HOME_HREF)}
      >
        CXApp Home
      </button>
    </div>
  );
}
