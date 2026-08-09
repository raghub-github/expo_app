"use client";

import { Suspense } from "react";
import { PartnerPendingNewOrdersBar } from "@/components/PartnerPendingNewOrdersBar";
import { PartnerIncomingOrderModal } from "@/components/PartnerIncomingOrderModal";
import { PartnerAcceptanceTimeoutSync } from "@/components/PartnerAcceptanceTimeoutSync";
import { PartnerShellWarmup } from "@/components/PartnerShellWarmup";
import { PartnerMerchantQueryFocusSync } from "@/components/PartnerMerchantQueryFocusSync";
import { GlobalToaster } from "@/components/GlobalToaster";
import { PartnerBrowserPushBootstrap } from "@/components/PartnerBrowserPushBootstrap";

/**
 * Global shell for /mx/* — floating pending-order badge on every merchant page.
 * Store id comes from localStorage when page passes placeholders.
 */
export default function MXLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-dvh overflow-hidden">
        {children}
      </div>
      <PartnerBrowserPushBootstrap />
      <GlobalToaster />
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
