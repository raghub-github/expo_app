"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Loader2 } from "lucide-react";

type SummaryResponse = {
  success: boolean;
  total?: number;
  counts?: Record<string, number>;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function WalletRequestsSummarySidebar({
  storeId,
  collapsed,
}: {
  storeId?: string | null;
  collapsed?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  });
  const [total, setTotal] = useState(0);

  const summaryUrl = storeId
    ? `/api/merchant/stores/${storeId}/wallet-requests/summary`
    : "/api/merchant/wallet-requests/summary";

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(summaryUrl, { credentials: "include" });
      const data = (await res.json()) as SummaryResponse;
      if (data?.success && data.counts) {
        setCounts({
          PENDING: n(data.counts.PENDING),
          APPROVED: n(data.counts.APPROVED),
          REJECTED: n(data.counts.REJECTED),
          CANCELLED: n(data.counts.CANCELLED),
        });
        setTotal(n(data.total));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [summaryUrl]);

  useEffect(() => {
    fetchSummary();
    const t = setInterval(fetchSummary, 30000);
    return () => clearInterval(t);
  }, [fetchSummary]);

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

  const isWalletRequestsActive = false; // could be derived from pathname if needed
  const tooltipLabel =
    badge.pending > 0 && !loading
      ? `Wallet requests (${badge.pending} Pending)`
      : "Wallet requests";

  if (collapsed) {
    return (
      <Link
        href={href}
        title={tooltipLabel}
        className={`group relative flex cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 transition-all duration-200 ${
          isWalletRequestsActive
            ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
            : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900"
        }`}
      >
        <div className="relative">
          <Wallet className="h-5 w-5 flex-shrink-0" />
          {!loading && badge.pending > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
              {badge.pending > 9 ? "9+" : badge.pending}
            </span>
          )}
        </div>
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
