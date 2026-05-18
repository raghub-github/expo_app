"use client";

import { Suspense } from "react";
import { PartnerPendingNewOrdersBar } from "@/components/PartnerPendingNewOrdersBar";
import { PartnerIncomingOrderModal } from "@/components/PartnerIncomingOrderModal";
import { GlobalToaster } from "@/components/GlobalToaster";

/**
 * Global shell for /mx/* — floating pending-order badge on every merchant page.
 * Store id comes from localStorage when page passes placeholders.
 */
export default function MXLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Reserve space for the fixed bottom "new orders" strip so page content never gets hidden behind it. */}
      <div
        className="min-h-dvh"
        style={{
          paddingBottom: "max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem))",
        }}
      >
        {children}
      </div>
      <GlobalToaster />
      <Suspense fallback={null}>
        <PartnerPendingNewOrdersBar />
      </Suspense>
      <PartnerIncomingOrderModal />
    </>
  );
}
