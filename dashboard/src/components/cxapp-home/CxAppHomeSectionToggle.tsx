"use client";

import { useEffect } from "react";
import {
  APP_CATEGORY_HREF,
  CXAPP_HOME_HREF,
  useCustomerAppSectionOptional,
  type CustomerAppSectionTab,
} from "@/components/cxapp-home/CustomerAppSectionContext";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";

/**
 * Pill toggle between App Category and CXApp Home.
 * Uses section context when inside the shared layout so content swaps on the same tick as the highlight.
 */
export function CxAppHomeSectionToggle() {
  const ctx = useCustomerAppSectionOptional();
  const pathname = useAppPathname();
  const router = useRouter();

  // Fallback when rendered outside the provider (should be rare).
  const active: CustomerAppSectionTab =
    ctx?.activeTab ??
    (pathname === CXAPP_HOME_HREF || pathname.startsWith(`${CXAPP_HOME_HREF}/`)
      ? "cxapp-home"
      : "app-category");

  useEffect(() => {
    ctx?.warmTab("app-category");
    ctx?.warmTab("cxapp-home");
  }, [ctx]);

  const onSelect = (tab: CustomerAppSectionTab) => {
    if (ctx) {
      ctx.switchTab(tab);
      return;
    }
    const href = tab === "cxapp-home" ? CXAPP_HOME_HREF : APP_CATEGORY_HREF;
    if (pathname !== href) router.replace(href);
  };

  const tabClass = (id: CustomerAppSectionTab) =>
    [
      "relative z-10 inline-flex min-w-[7.75rem] items-center justify-center rounded-full px-4 py-2 text-[13px] font-semibold transition-colors duration-150",
      active === id ? "text-cyan-900" : "text-slate-500 hover:text-slate-800",
    ].join(" ");

  return (
    <div
      className="relative z-30 inline-flex shrink-0 rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/90"
      role="tablist"
      aria-label="Customer app section"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1 bottom-1 rounded-full bg-white shadow-sm ring-1 ring-cyan-200/80 transition-[left,right] duration-150 ease-out ${
          active === "app-category" ? "left-1 right-1/2" : "left-1/2 right-1"
        }`}
      />
      <button
        type="button"
        role="tab"
        aria-selected={active === "app-category"}
        className={tabClass("app-category")}
        onMouseEnter={() => ctx?.warmTab("app-category")}
        onFocus={() => ctx?.warmTab("app-category")}
        onClick={() => onSelect("app-category")}
      >
        App Category
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "cxapp-home"}
        className={tabClass("cxapp-home")}
        onMouseEnter={() => ctx?.warmTab("cxapp-home")}
        onFocus={() => ctx?.warmTab("cxapp-home")}
        onClick={() => onSelect("cxapp-home")}
      >
        CXApp Home
      </button>
    </div>
  );
}
