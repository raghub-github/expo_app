"use client";

import { useEffect, useState } from "react";
import { mapCache } from "@/lib/map-cache";
import OrderHeader from "./OrderHeader";
import OrderDetailClient from "./OrderDetailClient";

interface OrderPageClientProps {
  orderPublicId: string;
}

/** Standalone order shell — auth/bootstrap provided by order/layout.tsx. */
export default function OrderPageClient({ orderPublicId }: OrderPageClientProps) {
  const [orderNotFound, setOrderNotFound] = useState(false);

  useEffect(() => {
    void mapCache.loadMapboxScript();
  }, []);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#F8FAFC]">
      {!orderNotFound && <OrderHeader />}
      <main
        className={
          orderNotFound
            ? "flex min-h-0 flex-1 flex-col"
            : "flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 md:px-6 md:py-4"
        }
      >
        <OrderDetailClient
          orderPublicId={orderPublicId}
          onNotFoundChange={setOrderNotFound}
        />
      </main>
    </div>
  );
}
