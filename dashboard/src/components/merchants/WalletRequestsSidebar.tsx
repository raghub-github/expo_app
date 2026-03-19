"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Wallet, ChevronRight, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

type RequestItem = {
  id: number;
  merchant_store_id: number;
  store_code: string;
  store_name: string;
  direction: string;
  amount: number;
  reason: string;
  status: string;
  requested_by_email: string | null;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  order_id: number | null;
};

export function WalletRequestsSidebar({ storeId }: { storeId?: string | null } = {}) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const url = storeId
        ? `/api/merchant/stores/${storeId}/wallet-requests?limit=30`
        : "/api/merchant/wallet-requests?limit=30";
      const res = await fetch(url, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setRequests(data.requests);
        setTotal(data.total ?? data.requests.length);
      }
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchRequests();
    const t = setInterval(fetchRequests, 30000);
    return () => clearInterval(t);
  }, [fetchRequests]);

  if (loading && requests.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Wallet className="h-4 w-4" />
          Wallet requests
        </div>
        <div className="mt-2 flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Wallet className="h-4 w-4" />
          Wallet requests
        </div>
        <p className="mt-2 text-xs text-gray-500">No requests yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Wallet className="h-4 w-4" />
          Wallet requests
        </div>
        {total > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
            {total} total
            {pendingCount > 0 && (
              <span className="ml-1 text-amber-700">· {pendingCount} pending</span>
            )}
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-1.5 max-h-80 overflow-y-auto">
        {requests.map((r) => (
          <li key={r.id}>
            <Link
              href={`/dashboard/merchants/stores/${r.merchant_store_id}/payments`}
              className="block rounded-lg border border-gray-100 bg-gray-50/50 p-2 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">{r.store_name}</p>
                  <p className="text-[10px] text-gray-500">
                    {r.direction === "CREDIT" ? "+" : "−"}₹{r.amount.toLocaleString("en-IN")}
                    {r.order_id ? ` · Order #${r.order_id}` : ""}
                  </p>
                  <p className="text-[10px] text-gray-600 truncate mt-0.5">{r.reason}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                    r.status === "PENDING"
                      ? "text-amber-700"
                      : r.status === "APPROVED"
                        ? "text-emerald-700"
                        : "text-red-700"
                  }`}
                >
                  {r.status === "PENDING" ? (
                    <Clock className="h-3 w-3" />
                  ) : r.status === "APPROVED" ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {r.status}
                </span>
                {(r.status === "APPROVED" || r.status === "REJECTED") &&
                  (r.reviewed_by_name || r.reviewed_by_email) && (
                    <span className="text-[10px] text-gray-500 truncate">
                      by {r.reviewed_by_name || r.reviewed_by_email}
                    </span>
                  )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={storeId ? `/dashboard/merchants/stores/${storeId}/payments` : "/dashboard/merchants"}
        className="mt-2 block text-center text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        {storeId ? "View payments →" : "View all →"}
      </Link>
    </div>
  );
}
