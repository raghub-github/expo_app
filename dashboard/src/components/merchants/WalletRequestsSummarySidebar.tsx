"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, Loader2 } from "lucide-react";
import { useMerchantWalletRequestsSummaryQuery } from "@/hooks/queries/useMerchantWalletRequestsSummaryQuery";

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function WalletRequestsSummarySidebar({
  storeId,
  collapsed = false,
}: {
  storeId?: string | null;
  collapsed?: boolean;
}) {
  const { data, isPending, isFetching } = useMerchantWalletRequestsSummaryQuery(storeId);

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

  const loading = isPending || isFetching;

  const tooltipLabel = useMemo(
    () =>
      `${badge.pending} pending · ${badge.approved} approved · ${badge.rejected} rejected · ${total} total`,
    [badge.pending, badge.approved, badge.rejected, total]
  );

  const href = storeId
    ? `/dashboard/merchants/stores/${encodeURIComponent(storeId)}/payments`
    : "/dashboard/merchants/wallet-requests";

  if (collapsed) {
    return (
      <Link
        href={href}
        title={`Wallet requests — ${tooltipLabel}`}
        className="group relative flex w-full cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-gray-900 transition-all duration-200 hover:bg-gray-200/80 hover:text-gray-900"
      >
        <Wallet className="h-5 w-5 flex-shrink-0" />
        {loading ? (
          <Loader2 className="absolute h-3.5 w-3.5 animate-spin text-gray-400" />
        ) : badge.pending > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-white">
            {badge.pending > 99 ? "99+" : badge.pending}
          </span>
        ) : null}
        <div className="pointer-events-none absolute right-full z-50 mr-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          Wallet requests
          <div className="mt-0.5 text-[10px] font-normal text-gray-300">{tooltipLabel}</div>
          <div className="absolute right-0 top-1/2 translate-x-1 -translate-y-1/2 border-4 border-transparent border-l-gray-900" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group relative grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-2 py-2 text-xs font-medium text-gray-900 transition-all duration-200 hover:-translate-x-1 hover:bg-gray-200/80 hover:text-gray-900"
    >
      <span className="flex size-5 items-center justify-center justify-self-start text-current">
        <Wallet className="h-4 w-4 shrink-0" aria-hidden />
      </span>
      <span className="min-w-0 truncate text-left text-xs font-medium">Wallet requests</span>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 justify-self-end animate-spin text-gray-400" aria-hidden />
      ) : (
        <span className="shrink-0 justify-self-end rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          {badge.pending} Pending
        </span>
      )}
      <div className="pointer-events-none absolute right-full z-50 mr-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tooltipLabel}
        <div className="absolute right-0 top-1/2 translate-x-1 -translate-y-1/2 border-4 border-transparent border-l-gray-900" />
      </div>
    </Link>
  );
}
