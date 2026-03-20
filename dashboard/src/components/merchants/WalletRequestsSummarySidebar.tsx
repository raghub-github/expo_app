"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { useMerchantWalletRequestsSummaryQuery } from "@/hooks/queries/useMerchantWalletRequestsSummaryQuery";

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function WalletRequestsSummarySidebar({ storeId }: { storeId?: string | null }) {
  const { data } = useMerchantWalletRequestsSummaryQuery(storeId);

  const counts = data?.counts ?? {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };

  const total = n(data?.total);

  const badge = useMemo(() => {
    const pending = n(counts.PENDING);
    const approved = n(counts.APPROVED);
    const rejected = n(counts.REJECTED);
    return { pending, approved, rejected };
  }, [counts]);

  // When a store is selected, keep the user inside that store scope (payments page).
  // Global wallet-requests page is still available but we don't link to it from store context.
  const href = storeId
    ? `/dashboard/merchants/stores/${encodeURIComponent(storeId)}/payments`
    : "/dashboard/merchants/wallet-requests";

  return (
    <Link
      href={href}
      className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 transition-colors"
    >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Wallet className="h-4 w-4" />
            Wallet requests
          </div>
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
            {total} total
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            {badge.pending} Pending
          </span>
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
            {badge.approved} Approved
          </span>
          <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
            {badge.rejected} Rejected
          </span>
        </div>
        <p className="mt-1 text-[10px] text-gray-500">Click to view and filter all requests</p>
    </Link>
  );
}
