"use client";

import { useState } from "react";
import OrderHeader from "./OrderHeader";
import OrderDetailClient from "./OrderDetailClient";

interface OrderPageClientProps {
  orderPublicId: string;
}

export default function OrderPageClient({ orderPublicId }: OrderPageClientProps) {
  const [orderLoading, setOrderLoading] = useState(true);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <OrderHeader forceSkeleton={orderLoading} />
      <main className="px-3 py-3 sm:px-4 md:px-6 md:py-4">
        <OrderDetailClient
          orderPublicId={orderPublicId}
          onLoadingChange={setOrderLoading}
        />
      </main>
    </div>
  );
}
