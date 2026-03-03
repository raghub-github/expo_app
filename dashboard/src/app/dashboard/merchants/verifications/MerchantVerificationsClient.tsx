"use client";

import Link from "next/link";
import { Store, ArrowRight } from "lucide-react";

/**
 * Verification page without storeId: no data is loaded.
 * User must go to Merchants, select a store, and click Verify to open verification for that store.
 */
export function MerchantVerificationsClient() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-500">
        <Store className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-gray-900">
        No store selected for verification
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        To verify a store, go to <strong>Merchants</strong>, choose a store, and click{" "}
        <strong>Verify</strong>. Verification details will open only for that store.
      </p>
      <Link
        href="/dashboard/merchants"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Go to Merchants
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
