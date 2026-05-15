"use client";

import { Suspense } from "react";
import { PartnerPendingNewOrdersBar } from "@/components/PartnerPendingNewOrdersBar";
import { PartnerIncomingOrderModal } from "@/components/PartnerIncomingOrderModal";
import { GlobalToaster } from "@/components/GlobalToaster";

/**
 * Global shell for /partners/* — same as /mx/*.
 */
export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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

