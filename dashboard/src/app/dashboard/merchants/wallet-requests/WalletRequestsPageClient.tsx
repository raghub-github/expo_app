"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, ChevronRight } from "lucide-react";

type RequestItem = {
  id: number;
  merchant_store_id: number;
  store_code: string;
  store_name: string;
  direction: string;
  amount: number;
  reason: string;
  category: string;
  status: string;
  requested_by_email: string | null;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  order_id: number | null;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function formatStatus(s: string) {
  if (s === "PENDING") return "Pending";
  if (s === "APPROVED") return "Approved";
  if (s === "REJECTED") return "Rejected";
  if (s === "CANCELLED") return "Cancelled";
  return s;
}

export function WalletRequestsPageClient({ storeId }: { storeId: string | null }) {
  const [status, setStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [direction, setDirection] = useState<"ALL" | "CREDIT" | "DEBIT">("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "", search: "" });
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 30;

  const baseUrl = storeId
    ? `/api/merchant/stores/${storeId}/wallet-requests`
    : "/api/merchant/wallet-requests";

  const buildUrl = useCallback(
    (nextPage: number) => {
      const q = new URLSearchParams();
      q.set("limit", String(limit));
      q.set("offset", String((nextPage - 1) * limit));
      if (status !== "ALL") q.set("status", status);
      if (direction !== "ALL") q.set("direction", direction);
      if (applied.search.trim()) q.set("search", applied.search.trim());
      if (applied.from) q.set("from", applied.from);
      if (applied.to) q.set("to", applied.to);
      return `${baseUrl}?${q.toString()}`;
    },
    [baseUrl, direction, applied, status]
  );

  const fetchPage = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const res = await fetch(buildUrl(nextPage), { credentials: "include" });
        const data = await res.json();
        if (data?.success && Array.isArray(data.requests)) {
          setTotal(n(data.total));
          setPage(nextPage);
          setRequests(data.requests);
        } else {
          setRequests([]);
          setTotal(0);
          setPage(1);
        }
      } catch {
        setRequests([]);
        setTotal(0);
        setPage(1);
      } finally {
        setLoading(false);
      }
    },
    [buildUrl]
  );

  useEffect(() => {
    fetchPage(1);
  }, [status, direction, applied, fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#121212]/55">
          Credit and debit requests across stores. Filter by status, direction, or date.
        </p>
        <span className="rounded-full bg-[#F3F7FA] px-2 py-0.5 text-[10px] font-semibold text-[#121212]/70">
          {total} total
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#121212]/10 bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
          <div className="border-b border-[#121212]/08 bg-[#F3F7FA] px-3 py-2.5">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[#121212]/10 bg-white p-0.5">
                    {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          status === s ? "bg-[#121212] text-white" : "text-[#121212]/70 hover:bg-[#F3F7FA]"
                        }`}
                      >
                        {s === "ALL" ? "All" : formatStatus(s)}
                      </button>
                    ))}
                  </div>

                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "ALL" | "CREDIT" | "DEBIT")}
                    className="h-8 text-xs border border-[#121212]/12 rounded-lg px-2.5 bg-white"
                  >
                    <option value="ALL">All directions</option>
                    <option value="CREDIT">Credit</option>
                    <option value="DEBIT">Debit</option>
                  </select>

                  <div className="relative">
                    <Search className="h-3.5 w-3.5 text-[#121212]/35 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Store, order, reason, email"
                      className="h-8 w-[min(420px,calc(100vw-6rem))] text-xs border border-[#121212]/12 rounded-lg pl-8 pr-3 bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="h-8 text-xs border border-[#121212]/12 rounded-lg px-2 bg-white"
                    />
                    <span className="text-[10px] text-[#121212]/40">to</span>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="h-8 text-xs border border-[#121212]/12 rounded-lg px-2 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setApplied({ from, to, search })}
                      className="h-8 rounded-lg bg-[#121212] px-3 text-[11px] font-semibold text-white"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFrom("");
                        setTo("");
                        setSearch("");
                        setApplied({ from: "", to: "", search: "" });
                      }}
                      className="h-8 rounded-lg border border-[#121212]/12 bg-white px-3 text-[11px] font-semibold text-[#121212]"
                    >
                      Clear
                    </button>
                  </div>
              </div>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading && requests.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-[#121212]/45">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading...
              </div>
            ) : requests.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#121212]/50">No requests found.</div>
            ) : (
              <div className="divide-y divide-[#121212]/06">
                {requests.map((r) => (
                  <div key={r.id} className="px-4 py-3 hover:bg-[#F3F7FA]/80">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[#121212] truncate">{r.store_name}</span>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              r.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : r.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {r.status}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              r.direction === "CREDIT" ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {r.direction === "CREDIT" ? "+" : "−"}₹{Number(r.amount).toLocaleString("en-IN")}
                          </span>
                          {r.order_id ? <span className="text-[10px] text-[#121212]/45">Order #{r.order_id}</span> : null}
                        </div>
                        <p className="text-xs text-[#121212]/80 mt-1 break-words">{r.reason}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#121212]/45">
                          <span>
                            Requested by {r.requested_by_name || r.requested_by_email || "—"} ·{" "}
                            {r.requested_at ? new Date(r.requested_at).toLocaleString("en-IN") : "—"}
                          </span>
                          {(r.status === "APPROVED" || r.status === "REJECTED") &&
                            (r.reviewed_by_name || r.reviewed_by_email) && (
                              <span>
                                {r.status === "APPROVED" ? "Approved" : "Rejected"} by{" "}
                                {r.reviewed_by_name || r.reviewed_by_email} ·{" "}
                                {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString("en-IN") : "—"}
                              </span>
                            )}
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/merchants/stores/${r.merchant_store_id}/payments`}
                        className="text-xs font-semibold text-[#121212] hover:underline whitespace-nowrap inline-flex items-center gap-1"
                      >
                        Open store <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#121212]/08 px-4 py-2.5 flex items-center justify-between bg-[#F3F7FA]">
            <div className="text-[10px] text-[#121212]/45">
              Page {page} of {totalPages} · Showing {requests.length} of {total}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchPage(page - 1)}
                disabled={!canPrev || loading}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-[#121212]/12 bg-white px-3 text-[11px] font-semibold text-[#121212] disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => fetchPage(page + 1)}
                disabled={!canNext || loading}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-[#121212] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
