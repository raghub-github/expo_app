"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  Loader2,
  Search,
  Scale,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatInr } from "@/lib/format-inr";
import { formatWalletOrderDisplayId } from "@/lib/merchants/format-wallet-order-id";
import { WalletAdjustmentApproveModal } from "@/components/payments/WalletAdjustmentApproveModal";

type AdjustmentRequest = {
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
  order_id: number | null;
  formatted_order_id?: string | null;
};

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type DirectionFilter = "ALL" | "CREDIT" | "DEBIT";

const rowBorder = "border-b-[0.5px] border-[#121212]/10";
const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";

function formatRequestedAt(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Full-page wallet credit/debit request queue (Payments → Adjustment tab). */
export function WalletAdjustmentsPanel({ onRefreshReady }: { onRefreshReady?: (fn: () => void) => void }) {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<AdjustmentRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [approveTarget, setApproveTarget] = useState<AdjustmentRequest | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("limit", "100");
      q.set("offset", "0");
      if (status !== "ALL") q.set("status", status);
      if (direction !== "ALL") q.set("direction", direction);
      if (appliedSearch.trim()) q.set("search", appliedSearch.trim());
      const res = await fetch(`/api/merchant/wallet-requests?${q.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.requests)) {
        setRequests(data.requests);
        setTotal(Number(data.total) || 0);
      } else {
        setRequests([]);
        setTotal(0);
      }
    } catch {
      setRequests([]);
      setTotal(0);
      toast.error("Failed to load adjustment requests");
    } finally {
      setLoading(false);
    }
  }, [status, direction, appliedSearch]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    onRefreshReady?.(fetchList);
  }, [onRefreshReady, fetchList]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setAppliedSearch(search.trim());
    }, 250);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "PENDING");
    const approved = requests.filter((r) => r.status === "APPROVED");
    const credits = requests.filter((r) => r.direction === "CREDIT");
    const debits = requests.filter((r) => r.direction === "DEBIT");
    const sum = (rows: AdjustmentRequest[]) =>
      rows.reduce((acc, r) => acc + (Number.isFinite(r.amount) ? Number(r.amount) : 0), 0);
    return {
      pendingCount: pending.length,
      pendingAmt: sum(pending),
      approvedCount: approved.length,
      approvedAmt: sum(approved),
      creditAmt: sum(credits),
      debitAmt: sum(debits),
      totalAmt: sum(requests),
    };
  }, [requests]);

  const handleApproveConfirm = async (payload: { amount: number; ledger_remark: string }) => {
    if (!approveTarget) return;
    const row = approveTarget;
    setActioningId(row.id);
    try {
      const res = await fetch(
        `/api/merchant/stores/${row.merchant_store_id}/wallet-requests/${row.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE",
            amount: payload.amount,
            ledger_remark: payload.ledger_remark,
          }),
        }
      );
      const data = await res.json();
      if (data?.success) {
        toast.success("Request approved — wallet & ledger updated");
        setApproveTarget(null);
        await fetchList();
      } else {
        toast.error(data?.error || "Approve failed");
      }
    } catch {
      toast.error("Approve failed");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (row: AdjustmentRequest) => {
    setActioningId(row.id);
    try {
      const res = await fetch(
        `/api/merchant/stores/${row.merchant_store_id}/wallet-requests/${row.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "REJECT" }),
        }
      );
      const data = await res.json();
      if (data?.success) {
        toast.success("Request rejected — no wallet/ledger impact");
        await fetchList();
      } else {
        toast.error(data?.error || "Reject failed");
      }
    } catch {
      toast.error("Reject failed");
    } finally {
      setActioningId(null);
    }
  };

  const hasActiveFilters =
    status !== "PENDING" || direction !== "ALL" || Boolean(appliedSearch.trim());

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-[#121212]/55">
          <span>
            In queue{" "}
            <span className="font-semibold tabular-nums text-[#121212]">{formatInr(stats.totalAmt)}</span>
            {total > 0 ? <span className="ml-1">({total})</span> : null}
          </span>
          <span>
            Pending{" "}
            <span className="font-semibold tabular-nums text-amber-700">{formatInr(stats.pendingAmt)}</span>
            {stats.pendingCount > 0 ? (
              <span className="ml-1 text-amber-700/80">({stats.pendingCount})</span>
            ) : null}
          </span>
          <span>
            Approved{" "}
            <span className="font-semibold tabular-nums text-emerald-700">
              {formatInr(stats.approvedAmt)}
            </span>
            {stats.approvedCount > 0 ? (
              <span className="ml-1 text-emerald-700/80">({stats.approvedCount})</span>
            ) : null}
          </span>
          <span>
            Credits{" "}
            <span className="font-semibold tabular-nums text-sky-700">{formatInr(stats.creditAmt)}</span>
          </span>
          <span>
            Debits{" "}
            <span className="font-semibold tabular-nums text-rose-700">{formatInr(stats.debitAmt)}</span>
          </span>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-md border-[0.5px] border-[#121212]/15 bg-white px-2.5 py-2 [scrollbar-width:thin]">
          <div
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-[#121212]/12 bg-[#F7F7F7] p-0.5"
            role="tablist"
            aria-label="Adjustment status"
          >
            {(["PENDING", "ALL", "APPROVED", "REJECTED"] as const).map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(s)}
                  className={`cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-[#121212] text-white"
                      : "text-[#121212]/65 hover:bg-white hover:text-[#121212]"
                  }`}
                >
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>

          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as DirectionFilter)}
            className="h-9 w-[8.5rem] shrink-0 rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212] outline-none focus:border-[#121212]/35"
          >
            <option value="ALL">All directions</option>
            <option value="CREDIT">Credit only</option>
            <option value="DEBIT">Debit only</option>
          </select>

          <div className="relative min-w-[12rem] flex-1 sm:min-w-[16rem]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search store, order, reason, email…"
              className="h-9 w-full rounded-md border border-[#121212]/12 bg-white py-1.5 pl-8 pr-2 text-xs text-[#121212] placeholder:text-[#121212]/40 outline-none focus:border-[#121212]/35"
            />
          </div>

          {loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#121212]/40" aria-label="Loading" />
          ) : null}

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setStatus("PENDING");
                setDirection("ALL");
              }}
              className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs font-medium text-[#121212]/65 hover:bg-[#F7F7F7]"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className={`mt-3 min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
        {loading && requests.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-[#121212]/45">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <Scale className="h-6 w-6 text-[#121212]/30" />
            <p className="text-sm font-medium text-[#121212]">No adjustment requests</p>
            <p className="max-w-sm text-xs text-[#121212]/50">
              When agents submit Manual adjustment from an order or store payments page, they appear
              here for approve / reject.
            </p>
          </div>
        ) : (
          <table
            className={`w-full min-w-[960px] border-collapse text-left text-sm ${
              loading ? "opacity-60" : ""
            }`}
          >
            <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
              <tr>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Store</th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Type</th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Order</th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Reason</th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                  Amount
                </th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Status</th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                  Requested
                </th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const isCredit = r.direction === "CREDIT";
                const orderDisplay = formatWalletOrderDisplayId(r.formatted_order_id, r.order_id);
                const orderHref =
                  r.formatted_order_id?.trim() ||
                  (r.order_id != null ? String(r.order_id) : null);
                return (
                  <tr key={r.id} className="hover:bg-[#F7F7F7]/70">
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <p className="font-semibold text-[#121212]">{r.store_name || "—"}</p>
                      <p className="font-mono text-[10px] text-[#121212]/40">{r.store_code || "—"}</p>
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isCredit ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownLeft className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        {isCredit ? "Credit" : "Debit"}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 align-middle font-mono text-xs ${rowBorder}`}>
                      {orderDisplay && orderHref ? (
                        <Link
                          href={`/order/${orderHref.replace(/^#/, "")}`}
                          className="text-[#121212] underline-offset-2 hover:underline"
                        >
                          {orderDisplay}
                        </Link>
                      ) : (
                        <span className="text-[#121212]/40">—</span>
                      )}
                    </td>
                    <td className={`max-w-[280px] px-3 py-2.5 align-middle ${rowBorder}`}>
                      <p className="line-clamp-2 text-xs leading-snug text-[#121212]/80">{r.reason}</p>
                      <p className="mt-0.5 text-[10px] text-[#121212]/45">
                        by {r.requested_by_name || r.requested_by_email || "—"}
                      </p>
                    </td>
                    <td
                      className={`px-3 py-2.5 align-middle text-right font-semibold tabular-nums ${rowBorder} ${
                        isCredit ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {formatInr(r.amount)}
                    </td>
                    <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          r.status === "PENDING"
                            ? "bg-amber-50 text-amber-800"
                            : r.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 align-middle text-xs text-[#121212]/60 ${rowBorder}`}
                    >
                      {formatRequestedAt(r.requested_at)}
                    </td>
                    <td className={`px-3 py-2.5 align-middle text-right ${rowBorder}`}>
                      {r.status === "PENDING" ? (
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setApproveTarget(r)}
                            disabled={actioningId !== null}
                            className="inline-flex items-center gap-1 rounded-md bg-[#121212] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black disabled:opacity-50"
                          >
                            {actioningId === r.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3 w-3" />
                            )}
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(r)}
                            disabled={actioningId !== null}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#121212]/40">
                          {r.reviewed_by_name || r.reviewed_by_email || "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <WalletAdjustmentApproveModal
        open={approveTarget != null}
        request={approveTarget}
        busy={actioningId != null && approveTarget != null && actioningId === approveTarget.id}
        onClose={() => {
          if (actioningId == null) setApproveTarget(null);
        }}
        onConfirm={handleApproveConfirm}
      />
    </div>
  );
}
