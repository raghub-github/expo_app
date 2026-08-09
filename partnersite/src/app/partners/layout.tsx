"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { PartnerPendingNewOrdersBar } from "@/components/PartnerPendingNewOrdersBar";
import { PartnerAcceptanceTimeoutSync } from "@/components/PartnerAcceptanceTimeoutSync";
import { PartnerShellWarmup } from "@/components/PartnerShellWarmup";
import { PartnerMerchantQueryFocusSync } from "@/components/PartnerMerchantQueryFocusSync";
import { GlobalToaster } from "@/components/GlobalToaster";
import { PartnerStoreAccessGate } from "@/components/PartnerStoreAccessGate";
import { PartnerShellFrame } from "@/components/PartnerShellFrame";
import { PartnerIncomingOrderModal } from "@/components/PartnerIncomingOrderModal";
import { PartnerBrowserPushBootstrap } from "@/components/PartnerBrowserPushBootstrap";

/** Routes that render their own full-screen UI instead of the partner shell. */
const ROUTES_WITHOUT_SHELL = [
  "/partners/all-stores",
  "/partners/cancelled",
  "/partners/completed",
  "/partners/restaurants",
  "/partners/user-insights/feedback",
];

function usesPartnerShell(pathname: string): boolean {
  return !ROUTES_WITHOUT_SHELL.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Global shell for /partners/* — accept-order live modal + floating pending count on every page.
 *
 * <PartnerShellFrame> holds the top bar and left sidebar and lives in this layout, so route
 * changes and refreshes only swap the main content; the chrome is never unmounted or blanked.
 *
 * Incoming modal is a static client import (same as /mx) — dynamic() was timing out under
 * heavy Next compile load (ChunkLoadError on the lazy chunk).
 */
export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const content = <PartnerStoreAccessGate>{children}</PartnerStoreAccessGate>;

  return (
    <>
      <div
        className="min-h-dvh"
        style={{
          paddingBottom: "max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem))",
        }}
      >
        {usesPartnerShell(pathname) ? (
          <PartnerShellFrame>{content}</PartnerShellFrame>
        ) : (
          content
        )}
      </div>
      <GlobalToaster />
      <PartnerBrowserPushBootstrap />
      <PartnerShellWarmup />
      <PartnerMerchantQueryFocusSync />
      <PartnerAcceptanceTimeoutSync />
      <Suspense fallback={null}>
        <PartnerPendingNewOrdersBar />
      </Suspense>
      <PartnerIncomingOrderModal />
    </>
  );
}
