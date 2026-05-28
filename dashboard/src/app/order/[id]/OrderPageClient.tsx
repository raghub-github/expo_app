"use client";

import { useState } from "react";
import OrderHeader from "./OrderHeader";
import OrderDetailClient from "./OrderDetailClient";

interface OrderPageClientProps {
  orderPublicId: string;
}

/** Standalone order shell — auth/bootstrap provided by order/layout.tsx. */
export default function OrderPageClient({ orderPublicId }: OrderPageClientProps) {
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderNotFound, setOrderNotFound] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {!orderNotFound && <OrderHeader forceSkeleton={orderLoading} />}
      <main className={orderNotFound ? "" : "px-3 py-3 sm:px-4 md:px-6 md:py-4"}>
        <OrderDetailClient
          orderPublicId={orderPublicId}
          onLoadingChange={setOrderLoading}
          onNotFoundChange={setOrderNotFound}
        />
      </main>
    </div>
  );
}
