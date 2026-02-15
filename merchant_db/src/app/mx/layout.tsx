"use client";

import MerchantHelpTicket from "@/components/MerchantHelpTicket";

export default function MXLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-40">
        <MerchantHelpTicket pageContext="dashboard" />
      </div>
    </>
  );
}
