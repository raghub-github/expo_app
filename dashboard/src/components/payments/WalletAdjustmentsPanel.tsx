"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  CheckCircle2,
  Clock,
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

function StatCard({
  label,
  value,
  count,
  icon,
  tone,
}: {
  label: string;
  value: string;
  count?: number;
  icon: React.ReactNode;
  tone: "indigo" | "amber" | "emerald" | "rose" | "sky";
}) {
  const wrap =
    tone === "indigo"
      ? "border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white"
      : tone === "amber"
        ? "border-amber-100 bg-gradient-to-br from-amber-50/90 to-white"
        : tone === "emerald"
          ? "border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white"
          : tone === "rose"
            ? "border-rose-100 bg-gradient-to-br from-rose-50/90 to-white"
            : "border-sky-100 bg-gradient-to-br from-sky-50/90 to-white";
  const iconWrap =
    tone === "indigo"
      ? "bg-indigo-100 text-indigo-700"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700"
        : tone === "emerald"
          ? "bg-emerald-100 text-emerald-700"
          : tone === "rose"
            ? "bg-rose-100 text-rose-700"
            : "bg-sky-100 text-sky-700";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${wrap}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-gray-500">{label}</p>
            {count != null && count > 0 ? (
              <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-gray-700 ring-1 ring-black/5">
                {count}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
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

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "PENDING");
    const approved = requests.filter((r) => r.status === "APPROVED");
    const rejected = requests.filter((r) => r.status === "REJECTED");
    const credits = requests.filter((r) => r.direction === "CREDIT");
    const debits = requests.filter((r) => r.direction === "DEBIT");
    const sum = (rows: AdjustmentRequest[]) =>
      rows.reduce((acc, r) => acc + (Number.isFinite(r.amount) ? Number(r.amount) : 0), 0);
    return {
      pendingCount: pending.length,
      pendingAmt: sum(pending),
      approvedCount: approved.length,
      approvedAmt: sum(approved),
      rejectedCount: rejected.length,
      rejectedAmt: sum(rejected),
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="In queue"
          value={formatInr(stats.totalAmt)}
          count={total}
          icon={<Scale className="h-5 w-5" />}
          tone="indigo"
        />
        <StatCard
          label="Pending"
          value={formatInr(stats.pendingAmt)}
          count={stats.pendingCount}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="Approved"
          value={formatInr(stats.approvedAmt)}
          count={stats.approvedCount}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="Credits"
          value={formatInr(stats.creditAmt)}
          icon={<ArrowDownLeft className="h-5 w-5" />}
          tone="sky"
        />
        <StatCard
          label="Debits"
          value={formatInr(stats.debitAmt)}
          icon={<ArrowUpRight className="h-5 w-5" />}
          tone="rose"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {(["PENDING", "ALL", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                status === s
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-white hover:text-gray-900"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as DirectionFilter)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
        >
          <option value="ALL">All directions</option>
          <option value="CREDIT">Credit only</option>
          <option value="DEBIT">Debit only</option>
        </select>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setAppliedSearch(search);
            }}
            placeholder="Search store, order, reason, email…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
          />
        </div>
        <button
          type="button"
          onClick={() => setAppliedSearch(search)}
          className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Search
        </button>
        {(appliedSearch || status !== "PENDING" || direction !== "ALL") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
              setStatus("PENDING");
              setDirection("ALL");
            }}
            className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Adjustment requests{" "}
            <span className="font-normal text-gray-500">
              ({stats.pendingCount} pending · {total} total)
            </span>
          </h3>
        </div>

        {loading && requests.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Scale className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-gray-800">No adjustment requests</p>
            <p className="max-w-sm text-xs text-gray-500">
              When agents submit Manual adjustment from an order or store payments page, they appear
              here for approve / reject.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r) => {
                  const isCredit = r.direction === "CREDIT";
                  const orderDisplay = formatWalletOrderDisplayId(r.formatted_order_id, r.order_id);
                  const orderHref =
                    r.formatted_order_id?.trim() ||
                    (r.order_id != null ? String(r.order_id) : null);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-indigo-50/30">
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-gray-900">{r.store_name || "—"}</p>
                        <p className="text-[11px] text-gray-500">{r.store_code || "—"}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isCredit
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                              : "bg-rose-50 text-rose-800 ring-1 ring-rose-100"
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
                      <td className="px-4 py-3 align-top font-mono text-xs text-gray-700">
                        {orderDisplay && orderHref ? (
                          <Link
                            href={`/order/${orderHref.replace(/^#/, "")}`}
                            className="text-indigo-600 hover:underline"
                          >
                            {orderDisplay}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="max-w-[280px] px-4 py-3 align-top">
                        <p className="line-clamp-2 text-xs leading-snug text-gray-800">{r.reason}</p>
                        <p className="mt-1 text-[10px] text-gray-500">
                          by {r.requested_by_name || r.requested_by_email || "—"}
                        </p>
                      </td>
                      <td
                        className={`px-4 py-3 align-top text-right font-bold tabular-nums ${
                          isCredit ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {isCredit ? "+" : "−"}
                        {formatInr(r.amount)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.status === "PENDING"
                              ? "bg-amber-100 text-amber-800"
                              : r.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-xs text-gray-600">
                        {formatRequestedAt(r.requested_at)}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {r.status === "PENDING" ? (
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setApproveTarget(r)}
                              disabled={actioningId !== null}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">
                            {r.reviewed_by_name || r.reviewed_by_email || "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
