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
import { ChevronRight } from "lucide-react";

/**
 * Single cross-link between App Category and CXApp Home (no duplicate "App Category" pill
 * on the App Category page).
 */
export function CxAppHomeSectionToggle() {
  const ctx = useCustomerAppSectionOptional();
  const pathname = useAppPathname();
  const router = useRouter();

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

  const goTo = active === "app-category" ? "cxapp-home" : "app-category";
  const label = goTo === "cxapp-home" ? "CXApp Home" : "App Category";

  return (
    <button
      type="button"
      onMouseEnter={() => ctx?.warmTab(goTo)}
      onFocus={() => ctx?.warmTab(goTo)}
      onClick={() => onSelect(goTo)}
      className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-teal-700 transition hover:text-teal-800"
    >
      {label}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
