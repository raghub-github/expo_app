"use client";

import { PartnerPendingNewOrdersBar } from "@/components/PartnerPendingNewOrdersBar";
import { PartnerIncomingOrderModal } from "@/components/PartnerIncomingOrderModal";
import { GlobalToaster } from "@/components/GlobalToaster";

/**
 * Global shell for /mx/* — pending new-order strip shows on every merchant page (except when
 * already on New orders list). Store id comes from localStorage when page passes placeholders.
 */
export default function MXLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GlobalToaster />
      <PartnerPendingNewOrdersBar />
      <PartnerIncomingOrderModal />
    </>
  );
}
