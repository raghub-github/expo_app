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

  const counts = data?.counts ?? {    PENDING: 0,
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
          </span>        </div>
        <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
          {tooltipLabel}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-gray-900" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group relative flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-xs font-medium text-gray-900 transition-all duration-200 hover:bg-gray-200/80 hover:text-gray-900 hover:-translate-x-1"
    >
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 truncate text-xs font-medium">Wallet requests</span>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 text-[10px]">
            {badge.pending} Pending
          </span>
        )}
      </div>
    </Link>
  );
}
