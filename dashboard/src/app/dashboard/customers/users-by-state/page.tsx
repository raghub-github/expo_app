"use client";

import { Suspense } from "react";
import { CustomerUsersByStateClient } from "@/components/customers/CustomerUsersByStateClient";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function CustomerUsersByStatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LoadingSpinner size="md" text="Loading..." />
        </div>
      }
    >
      <CustomerUsersByStateClient />
    </Suspense>
  );
}
