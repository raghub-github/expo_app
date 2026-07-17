"use client";

/**
 * Subscription refund history — admin view (with agent identity).
 *
 * Reusable component. Renders wherever a scoped refund list is useful:
 *   - Merchant store details page (props.storeId set) → single store history
 *   - Global admin index (no props)                    → all-merchant history
 *
 * Fetches from /api/admin/merchant-subscriptions/refunds. Actor columns are
 * populated by the backend admin route; if you ever render this on a
 * merchant-facing page, use a different data source that strips them.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  RotateCcw,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react";

type ActorInfo = {
  subjectId: string;
  systemUserId: number | null;
  email: string | null;
  name: string | null;
  role: string;
};

type RefundRow = {
  id: number;
  paymentId: number;
  subscriptionId: number;
  merchantId: number;
  storeId: number;
  storePublicId: string | null;
  storeName: string | null;
  planId: number | null;
  planName: string | null;
  planCode: string | null;
  gateway: "WALLET" | "RAZORPAY";
  amount: number;
  totalPaise: number;
  currency: string;
  refundReference: string;
  walletLedgerId: number | null;
  razorpayRefundId: string | null;
  razorpayPaymentId: string | null;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reason: string;
  actor: ActorInfo;
  initiatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
};

type Props = {
  /** When set, scope query to this single store. Otherwise all-merchant view. */
  storeId?: number;
  /** When set, scope query to a merchant (parent). Ignored if storeId also set. */
  merchantId?: number;
  /** Optional heading override. Defaults to "Subscription refund history". */
  title?: string;
  /** Rows per page. Defaults to 20. */
  pageSize?: number;
};

function inr(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function paise(p: number): string {
  return inr(Math.round(p) / 100);
}

function formatDate(iso: string | null): string {
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

function statusPill(s: RefundRow["status"]) {
  const map: Record<RefundRow["status"], string> = {
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[s];
}

export function SubscriptionRefundHistory({
  storeId,
  merchantId,
  title = "Subscription refund history",
  pageSize = 20,
}: Props) {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (storeId != null) qs.set("storeId", String(storeId));
      if (merchantId != null && storeId == null) qs.set("merchantId", String(merchantId));

      const res = await fetch(`/api/admin/merchant-subscriptions/refunds?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setRows((data.items ?? []) as RefundRow[]);
      setTotal(Number(data.total ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load refund history");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [storeId, merchantId, offset, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <RotateCcw size={16} className="text-rose-600" />
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {total.toLocaleString("en-IN")} total
          </span>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500">
          <Loader2 className="mr-2 animate-spin" size={16} /> Loading…
        </div>
      ) : error ? (
        <div className="m-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">
          No refunds recorded for this scope yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Refund</th>
                {storeId == null ? (
                  <th className="px-3 py-2 font-semibold">Store</th>
                ) : null}
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Agent</th>
                <th className="px-3 py-2 font-semibold">Initiated</th>
                <th className="w-8 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <>
                  <tr
                    key={r.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/60"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-slate-800">#{r.id}</div>
                      <div className="text-[11px] text-slate-500">Payment #{r.paymentId}</div>
                    </td>
                    {storeId == null ? (
                      <td className="px-3 py-2.5">
                        <div className="text-sm text-slate-800">
                          {r.storeName || `#${r.storeId}`}
                        </div>
                        {r.storePublicId ? (
                          <div className="text-[11px] text-slate-500">{r.storePublicId}</div>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">
                      <div className="text-sm text-slate-800">{r.planName || `#${r.planId}`}</div>
                      {r.planCode ? (
                        <div className="text-[11px] text-slate-500">{r.planCode}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-semibold text-slate-800">
                        {paise(r.totalPaise)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        {r.gateway === "WALLET" ? (
                          <Wallet size={14} className="text-indigo-600" />
                        ) : (
                          <CreditCard size={14} className="text-blue-600" />
                        )}
                        {r.gateway}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusPill(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {r.actor.role === "super_admin" ? (
                          <ShieldCheck size={12} className="text-purple-600" />
                        ) : (
                          <User size={12} className="text-slate-500" />
                        )}
                        <div>
                          <div className="text-xs font-medium text-slate-800">
                            {r.actor.name || r.actor.email || `#${r.actor.systemUserId ?? "?"}`}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            {r.actor.role}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {formatDate(r.initiatedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {expandedId === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                  </tr>
                  {expandedId === r.id ? (
                    <tr key={`${r.id}-detail`} className="bg-slate-50/40">
                      <td colSpan={storeId == null ? 9 : 8} className="px-3 py-3">
                        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                          <DetailField label="Reason" wide>
                            {r.reason}
                          </DetailField>
                          <DetailField label="Refund reference">
                            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                              {r.refundReference}
                            </code>
                          </DetailField>
                          {r.gateway === "WALLET" ? (
                            <DetailField label="Wallet ledger id">
                              #{r.walletLedgerId ?? "—"}
                            </DetailField>
                          ) : (
                            <>
                              <DetailField label="Razorpay refund id">
                                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                                  {r.razorpayRefundId ?? "—"}
                                </code>
                              </DetailField>
                              <DetailField label="Razorpay payment id">
                                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                                  {r.razorpayPaymentId ?? "—"}
                                </code>
                              </DetailField>
                            </>
                          )}
                          <DetailField label="Agent email">
                            {r.actor.email ?? "—"}
                          </DetailField>
                          <DetailField label="Agent system user id">
                            {r.actor.systemUserId != null ? `#${r.actor.systemUserId}` : "—"}
                          </DetailField>
                          <DetailField label="Agent JWT subject">
                            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                              {r.actor.subjectId}
                            </code>
                          </DetailField>
                          <DetailField label="Subscription id">
                            #{r.subscriptionId}
                          </DetailField>
                          <DetailField label="Merchant id">#{r.merchantId}</DetailField>
                          <DetailField label="Initiated">{formatDate(r.initiatedAt)}</DetailField>
                          <DetailField label="Completed">
                            {formatDate(r.completedAt)}
                          </DetailField>
                          {r.status === "FAILED" ? (
                            <DetailField label="Failure reason" wide>
                              <span className="text-rose-700">{r.failureReason ?? "—"}</span>
                            </DetailField>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
          <div>{`Showing ${pageStart}-${pageEnd} of ${total.toLocaleString("en-IN")}`}</div>
          <div className="flex gap-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
              disabled={!hasPrev || loading}
              className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setOffset(offset + pageSize)}
              disabled={!hasNext || loading}
              className="rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailField({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-xs text-slate-800">{children}</div>
    </div>
  );
}
