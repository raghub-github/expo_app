"use client";

/**
 * Combined subscription history for a merchant store — Control Dashboard view.
 *
 * Shows every purchase AND every refund in one date-sorted timeline. Refund
 * rows include full agent identity (name, email, role, JWT subject id).
 *
 * Fetches from /api/admin/merchant-subscriptions/stores/:storeId/history.
 * Merchant-facing surfaces (partner site, merchant app) use a different
 * endpoint that strips the actor field.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  User,
  Wallet,
} from "lucide-react";

type PurchaseEvent = {
  eventType: "PURCHASE";
  eventAt: string;
  id: number;
  subscriptionId: number;
  planId: number | null;
  planName: string | null;
  planCode: string | null;
  amount: number;
  totalPaise: number;
  gstPercent: number;
  gstAmountPaise: number;
  gateway: string;
  gatewayId: string | null;
  status: string;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  notes: string | null;
};

type ActorInfo = {
  subjectId: string;
  systemUserId: number | null;
  email: string | null;
  name: string | null;
  role: string;
};

type RefundEvent = {
  eventType: "REFUND";
  eventAt: string;
  id: number;
  paymentId: number;
  subscriptionId: number;
  planId: number | null;
  planName: string | null;
  planCode: string | null;
  gateway: "WALLET" | "RAZORPAY";
  amount: number;
  totalPaise: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reason: string;
  refundReference: string;
  walletLedgerId: number | null;
  razorpayRefundId: string | null;
  razorpayPaymentId: string | null;
  initiatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  actor: ActorInfo;
};

type HistoryEvent = PurchaseEvent | RefundEvent;

type ApiResponse = {
  success: boolean;
  items?: HistoryEvent[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  canRefund?: boolean;
  callerIsSuperAdmin?: boolean;
  error?: string;
};

type Props = {
  storeId: number;
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

function purchaseStatusPill(s: string) {
  const map: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    REFUNDED: "bg-slate-100 text-slate-600 border-slate-300",
    REFUND_PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    FAILED: "bg-rose-50 text-rose-700 border-rose-200",
    PENDING: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return map[s] ?? "bg-slate-100 text-slate-600 border-slate-300";
}

function refundStatusPill(s: RefundEvent["status"]) {
  const map: Record<RefundEvent["status"], string> = {
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[s];
}

function gatewayIcon(g: string) {
  if (g === "WALLET") return <Wallet size={14} className="text-indigo-600" />;
  if (g === "RAZORPAY") return <CreditCard size={14} className="text-blue-600" />;
  return <CreditCard size={14} className="text-slate-400" />;
}

export function SubscriptionHistory({ storeId, pageSize = 25 }: Props) {
  const [rows, setRows] = useState<HistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      const res = await fetch(
        `/api/admin/merchant-subscriptions/stores/${storeId}/history?${qs.toString()}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || !data.success || !data.items) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setRows(data.items);
      setTotal(Number(data.total ?? data.items.length));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [storeId, offset, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    let purchases = 0;
    let refunds = 0;
    let paid = 0;
    let refunded = 0;
    for (const r of rows) {
      if (r.eventType === "PURCHASE") {
        purchases++;
        if (r.status === "PAID") paid += r.totalPaise;
        if (r.status === "REFUNDED" || r.status === "REFUND_PENDING") refunded += r.totalPaise;
      } else {
        refunds++;
      }
    }
    return { purchases, refunds, paid, refunded };
  }, [rows]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-800">Subscription history</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {total.toLocaleString("en-IN")} events
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

      {/* Tiny stats row */}
      <div className="grid grid-cols-2 gap-2 border-b border-gray-100 px-4 py-2 sm:grid-cols-4">
        <StatMini label="Purchases" value={stats.purchases.toString()} />
        <StatMini label="Refunds" value={stats.refunds.toString()} />
        <StatMini label="Total paid" value={paise(stats.paid)} tone="emerald" />
        <StatMini label="Refunded amount" value={paise(stats.refunded)} tone="rose" />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          <Loader2 className="mr-2 animate-spin" size={16} /> Loading…
        </div>
      ) : error ? (
        <div className="m-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          No subscription activity yet. When the merchant purchases a plan, it will appear here.
        </div>
      ) : (
        <div>
          {rows.map((r) => {
            const key = `${r.eventType}-${r.id}`;
            const expanded = expandedKey === key;
            return (
              <div
                key={key}
                className="border-b border-gray-100 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setExpandedKey(expanded ? null : key)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/60"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {r.eventType === "PURCHASE" ? (
                      <div className="mt-0.5 rounded-lg bg-emerald-50 p-1.5">
                        <ShoppingCart size={14} className="text-emerald-600" />
                      </div>
                    ) : (
                      <div className="mt-0.5 rounded-lg bg-rose-50 p-1.5">
                        <RotateCcw size={14} className="text-rose-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">
                          {r.eventType === "PURCHASE" ? "Purchase" : "Refund"} · {r.planName || `Plan #${r.planId}`}
                        </span>
                        {r.eventType === "PURCHASE" ? (
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${purchaseStatusPill(
                              r.status
                            )}`}
                          >
                            {r.status.replace("_", " ")}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${refundStatusPill(
                              r.status
                            )}`}
                          >
                            {r.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          {gatewayIcon(r.gateway)} {r.gateway}
                        </span>
                        <span>{formatDate(r.eventAt)}</span>
                        {r.eventType === "REFUND" ? (
                          <span className="inline-flex items-center gap-1">
                            {r.actor.role === "super_admin" ? (
                              <ShieldCheck size={11} className="text-purple-600" />
                            ) : (
                              <User size={11} className="text-slate-500" />
                            )}
                            <span className="font-medium text-gray-700">
                              {r.actor.name || r.actor.email || `#${r.actor.systemUserId ?? "?"}`}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span className="uppercase tracking-wide">{r.actor.role}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 pl-2">
                    <span className={`text-sm font-bold ${r.eventType === "REFUND" ? "text-rose-700" : "text-gray-900"}`}>
                      {r.eventType === "REFUND" ? "−" : ""}
                      {paise(r.totalPaise)}
                    </span>
                    {expanded ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </div>
                </button>
                {expanded ? (
                  <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                      {r.eventType === "PURCHASE" ? (
                        <>
                          <Field label="Payment ID">#{r.id}</Field>
                          <Field label="Subscription ID">#{r.subscriptionId}</Field>
                          <Field label="Plan code">{r.planCode ?? "—"}</Field>
                          <Field label="Base amount">{paise(r.totalPaise - r.gstAmountPaise)}</Field>
                          {r.gstPercent > 0 ? (
                            <Field label={`GST (${r.gstPercent}%)`}>{paise(r.gstAmountPaise)}</Field>
                          ) : null}
                          <Field label="Total charged">{paise(r.totalPaise)}</Field>
                          <Field label="Gateway reference">
                            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                              {r.gatewayId ?? "—"}
                            </code>
                          </Field>
                          <Field label="Billing period">
                            {r.billingPeriodStart && r.billingPeriodEnd
                              ? `${formatDate(r.billingPeriodStart)} → ${formatDate(r.billingPeriodEnd)}`
                              : "—"}
                          </Field>
                          {r.notes ? <Field label="Notes" wide>{r.notes}</Field> : null}
                        </>
                      ) : (
                        <>
                          <Field label="Refund ID">#{r.id}</Field>
                          <Field label="For payment">#{r.paymentId}</Field>
                          <Field label="Subscription ID">#{r.subscriptionId}</Field>
                          <Field label="Reason" wide>{r.reason}</Field>
                          <Field label="Refund reference">
                            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                              {r.refundReference}
                            </code>
                          </Field>
                          {r.gateway === "WALLET" ? (
                            <Field label="Wallet ledger ID">#{r.walletLedgerId ?? "—"}</Field>
                          ) : (
                            <>
                              <Field label="Razorpay refund ID">
                                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                                  {r.razorpayRefundId ?? "—"}
                                </code>
                              </Field>
                              <Field label="Razorpay payment ID">
                                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">
                                  {r.razorpayPaymentId ?? "—"}
                                </code>
                              </Field>
                            </>
                          )}
                          <Field label="Initiated">{formatDate(r.initiatedAt)}</Field>
                          <Field label="Completed">{formatDate(r.completedAt)}</Field>
                          {r.status === "FAILED" ? (
                            <Field label="Failure reason" wide>
                              <span className="text-rose-700">{r.failureReason ?? "—"}</span>
                            </Field>
                          ) : null}
                          <div className="col-span-full mt-1 rounded-md bg-purple-50/70 p-2">
                            <div className="text-[10px] font-medium uppercase tracking-wide text-purple-700">
                              Agent
                            </div>
                            <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-3">
                              <Field label="Name">{r.actor.name ?? "—"}</Field>
                              <Field label="Email">{r.actor.email ?? "—"}</Field>
                              <Field label="Role">
                                <span className="uppercase tracking-wide">{r.actor.role}</span>
                              </Field>
                              <Field label="System user ID">
                                {r.actor.systemUserId != null ? `#${r.actor.systemUserId}` : "—"}
                              </Field>
                              <Field label="JWT subject" wide>
                                <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] break-all">
                                  {r.actor.subjectId}
                                </code>
                              </Field>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/60 px-3 py-2 text-xs text-gray-600">
          <div>{`Showing ${pageStart}-${pageEnd} of ${total.toLocaleString("en-IN")}`}</div>
          <div className="flex gap-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
              disabled={!hasPrev || loading}
              className="rounded border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setOffset(offset + pageSize)}
              disabled={!hasNext || loading}
              className="rounded border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatMini({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "rose";
}) {
  const map = {
    slate: "text-slate-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
  } as const;
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-semibold ${map[tone]}`}>{value}</div>
    </div>
  );
}

function Field({
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
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 text-xs text-gray-800">{children}</div>
    </div>
  );
}
