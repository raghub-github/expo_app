"use client";

import { Suspense } from "react";
import { CustomersGlobalSearchView } from "@/components/customers/CustomersGlobalSearchView";

export default function ParcelCustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 px-2 sm:px-4 md:px-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">Loading...</div>
        </div>
      }
    >
      <CustomersGlobalSearchView />
    </Suspense>
  );
}
