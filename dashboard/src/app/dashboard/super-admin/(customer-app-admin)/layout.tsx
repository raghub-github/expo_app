"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import {
  CustomerAppSectionProvider,
  isCxAppHomeStateDetailPath,
  useCustomerAppSection,
} from "@/components/cxapp-home/CustomerAppSectionContext";
import CustomerAppCategoriesClient from "./customer-app-categories/CustomerAppCategoriesClient";
import { CxAppHomeClient } from "./cxapp-home/CxAppHomeClient";

/**
 * Keeps both list UIs mounted and toggles visibility instantly.
 * URL still updates via router.replace so bookmarks / refresh stay correct.
 */
function TwinListShell() {
  const { activeTab } = useCustomerAppSection();
  const [mountedCx, setMountedCx] = useState(activeTab === "cxapp-home");
  const [mountedCat, setMountedCat] = useState(activeTab === "app-category");

  useEffect(() => {
    if (activeTab === "cxapp-home") setMountedCx(true);
    if (activeTab === "app-category") setMountedCat(true);
  }, [activeTab]);

  return (
    <>
      {mountedCat ? (
        <div
          className={activeTab === "app-category" ? "block" : "hidden"}
          aria-hidden={activeTab !== "app-category"}
        >
          <CustomerAppCategoriesClient />
        </div>
      ) : null}
      {mountedCx ? (
        <div
          className={activeTab === "cxapp-home" ? "block" : "hidden"}
          aria-hidden={activeTab !== "cxapp-home"}
        >
          <CxAppHomeClient initialStates={[]} />
        </div>
      ) : null}
    </>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = useAppPathname();
  if (isCxAppHomeStateDetailPath(pathname)) {
    return <>{children}</>;
  }
  return <TwinListShell />;
}

export default function CustomerAppAdminLayout({ children }: { children: ReactNode }) {
  return (
    <CustomerAppSectionProvider>
      <ShellInner>{children}</ShellInner>
    </CustomerAppSectionProvider>
  );
}
