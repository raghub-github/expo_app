"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import {
  merchantStoreHref,
  readLastMerchantStoreId,
  storePageSuffix,
} from "@/lib/merchants/effective-store-id";

/** When `/stores/[id]` is missing from the URL, restore the last opened store. */
export function RecoverStoreIdClient() {
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const [missing, setMissing] = useState(false);
  const search = searchParams.toString();

  useEffect(() => {
    const last = readLastMerchantStoreId();
    if (!last) {
      setMissing(true);
      return;
    }
    router.replace(merchantStoreHref(last, storePageSuffix(pathname), search));
  }, [pathname, router, search]);

  if (missing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500">
          Invalid store ID. Open a store from Merchant Portal search and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <p className="mt-4 text-sm text-gray-500">Opening store…</p>
    </div>
  );
}
