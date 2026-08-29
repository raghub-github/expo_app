"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import {
  CustomerAppSectionProvider,
  isCxAppHomeStateDetailPath,
  tabFromCustomerAppPath,
  useCustomerAppSection,
} from "@/components/cxapp-home/CustomerAppSectionContext";
import { CxAppHomeStateDetailSkeleton } from "@/components/cxapp-home/CxAppHomeStateDetailSkeleton";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import CustomerAppCategoriesClient from "./customer-app-categories/CustomerAppCategoriesClient";
import { CxAppHomeClient } from "./cxapp-home/CxAppHomeClient";

/**
 * Keeps both list UIs mounted and toggles visibility instantly.
 * The App Router page slot (`children`) stays mounted for the current route so
 * header back / parent-route Link clicks are not no-ops.
 */
function TwinListShell({ children }: { children: ReactNode }) {
  const pathname = useAppPathname();
  const { activeTab } = useCustomerAppSection();
  const routeTab = tabFromCustomerAppPath(pathname);
  const [mountedCx, setMountedCx] = useState(activeTab === "cxapp-home");
  const [mountedCat, setMountedCat] = useState(activeTab === "app-category");

  useEffect(() => {
    if (activeTab === "cxapp-home") setMountedCx(true);
    if (activeTab === "app-category") setMountedCat(true);
  }, [activeTab]);

  const showCat = activeTab === "app-category";
  const showCx = activeTab === "cxapp-home";

  return (
    <>
      {mountedCat || routeTab === "app-category" ? (
        <div className={showCat ? "block" : "hidden"} aria-hidden={!showCat}>
          {routeTab === "app-category" ? children : <CustomerAppCategoriesClient />}
        </div>
      ) : null}
      {mountedCx || routeTab === "cxapp-home" ? (
        <div className={showCx ? "block" : "hidden"} aria-hidden={!showCx}>
          {routeTab === "cxapp-home" ? children : <CxAppHomeClient initialStates={[]} />}
        </div>
      ) : null}
    </>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = useAppPathname();
  const pendingNavHref = useCurrentRoute()?.pendingNavHref ?? null;
  const onStateDetail = isCxAppHomeStateDetailPath(pathname);
  const pendingStateDetail =
    pendingNavHref != null && isCxAppHomeStateDetailPath(pendingNavHref);

  if (onStateDetail) {
    return <>{children}</>;
  }
  if (pendingStateDetail) {
    return <CxAppHomeStateDetailSkeleton />;
  }
  return <TwinListShell>{children}</TwinListShell>;
}

export default function CustomerAppAdminLayout({ children }: { children: ReactNode }) {
  return (
    <CustomerAppSectionProvider>
      <ShellInner>{children}</ShellInner>
    </CustomerAppSectionProvider>
  );
}
