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
  formatted_order_id?: string | null;
};

const rowBorder = "border-b-[0.5px] border-[#121212]/10";
const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";

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

function statusBadgeClass(status: string) {
  if (status === "PENDING") return "bg-amber-50 text-amber-800";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-800";
  if (status === "REJECTED") return "bg-red-50 text-red-700";
  return "bg-[#F4F4F4] text-[#121212]/60";
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#121212]/10 bg-white p-0.5">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
          className="h-8 cursor-pointer rounded-lg border border-[#121212]/12 bg-white px-2.5 text-xs"
        >
          <option value="ALL">All directions</option>
          <option value="CREDIT">Credit</option>
          <option value="DEBIT">Debit</option>
        </select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setApplied({ from, to, search });
            }}
            placeholder="Store, order, reason, email"
            className="h-8 w-[min(280px,calc(100vw-6rem))] rounded-lg border border-[#121212]/12 bg-white pl-8 pr-3 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-lg border border-[#121212]/12 bg-white px-2 text-xs"
          />
          <span className="text-[10px] text-[#121212]/40">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-lg border border-[#121212]/12 bg-white px-2 text-xs"
          />
          <button
            type="button"
            onClick={() => setApplied({ from, to, search })}
            className="h-8 cursor-pointer rounded-lg bg-[#121212] px-3 text-[11px] font-semibold text-white hover:bg-black"
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
            className="h-8 cursor-pointer rounded-lg border border-[#121212]/12 bg-white px-3 text-[11px] font-semibold text-[#121212] hover:bg-[#F7F7F7]"
          >
            Clear
          </button>
        </div>

        <span className="ml-auto rounded-md bg-[#F3F7FA] px-2 py-1 text-[10px] font-semibold text-[#121212]/65">
          {total} total
        </span>
      </div>

      <div className={`min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
            <tr>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Store
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Status
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Amount
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Order
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Reason
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Requested
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-semibold ${rowBorder}`}>
                Reviewed
              </th>
              <th
                className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right font-semibold ${rowBorder}`}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && requests.length === 0 ? (
              <tr>
                <td colSpan={8} className={`px-3 py-10 text-center text-sm text-[#121212]/50 ${rowBorder}`}>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </span>
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={8} className={`px-3 py-10 text-center text-sm text-[#121212]/50 ${rowBorder}`}>
                  No requests found.
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const orderLabel = r.formatted_order_id
                  ? `#${String(r.formatted_order_id).replace(/^#/, "")}`
                  : r.order_id
                    ? `#${r.order_id}`
                    : "—";
                const reviewedBy = r.reviewed_by_name || r.reviewed_by_email;
                return (
                  <tr key={r.id} className="bg-white hover:bg-[#FAFAFA]">
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <p className="truncate text-[13px] font-medium text-[#121212]" title={r.store_name}>
                        {r.store_name || "—"}
                      </p>
                      {r.store_code ? (
                        <p className="truncate font-mono text-[10px] uppercase text-[#121212]/40">
                          {r.store_code}
                        </p>
                      ) : null}
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <span
                        className={`text-[13px] font-semibold tabular-nums ${
                          r.direction === "CREDIT" ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {r.direction === "CREDIT" ? "+" : "−"}₹
                        {Number(r.amount).toLocaleString("en-IN")}
                      </span>
                      <p className="text-[10px] uppercase tracking-wide text-[#121212]/40">
                        {r.direction || "—"}
                      </p>
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <span className="font-mono text-[12px] text-[#121212]/55">{orderLabel}</span>
                    </td>
                    <td className={`max-w-[220px] px-3 py-2.5 align-middle ${rowBorder}`}>
                      <p className="line-clamp-2 text-[12px] text-[#121212]/70" title={r.reason || undefined}>
                        {r.reason || "—"}
                      </p>
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <p className="truncate text-[12px] text-[#121212]">
                        {r.requested_by_name || r.requested_by_email || "—"}
                      </p>
                      <p className="text-[10px] text-[#121212]/40">{formatWhen(r.requested_at)}</p>
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      {r.status === "APPROVED" || r.status === "REJECTED" ? (
                        <>
                          <p className="truncate text-[12px] text-[#121212]">{reviewedBy || "—"}</p>
                          <p className="text-[10px] text-[#121212]/40">{formatWhen(r.reviewed_at)}</p>
                        </>
                      ) : (
                        <span className="text-[12px] text-[#121212]/35">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 align-middle text-right ${rowBorder}`}>
                      <Link
                        href={`/dashboard/merchants/stores/${r.merchant_store_id}/payments`}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-[#121212] px-3 text-[11px] font-semibold text-white hover:bg-black"
                      >
                        Open
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-[#121212]/45">
          Page {page} of {totalPages} · Showing {requests.length} of {total}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchPage(page - 1)}
            disabled={!canPrev || loading}
            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-[#121212]/12 bg-white px-3 text-[11px] font-semibold text-[#121212] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => fetchPage(page + 1)}
            disabled={!canNext || loading}
            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-[#121212] px-3 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
