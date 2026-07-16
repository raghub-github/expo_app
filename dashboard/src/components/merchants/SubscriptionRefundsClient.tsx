"use client";

/**
 * Merchant Subscription Refunds — admin-only refund + revoke UI.
 *
 * Data flow:
 *   1. Client fetches paginated payments from /api/admin/merchant-subscriptions
 *      /payments (which proxies to backend). Backend attaches `refundable` +
 *      `refundDeadline` per row so the UI can render without duplicating
 *      the 7-day rule.
 *   2. "Refund" opens a modal showing exactly what will happen (wallet path
 *      credits back to wallet; Razorpay path calls Razorpay Refund API).
 *   3. On confirm, POST to /api/admin/merchant-subscriptions/payments/:id
 *      /refund. Success → row updates in place, toast fires.
 *
 * The 7-day window is enforced on the backend too — a stale UI cannot bypass
 * it by hitting the API directly.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Eye,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";

type PaymentRow = {
  id: number;
  merchantId: number;
  storeId: number;
  storePublicId: string | null;
  storeName: string | null;
  storeEmail: string | null;
  subscriptionId: number;
  subscriptionStatus: string | null;
  subscriptionIsActive: boolean;
  subscriptionExpiry: string | null;
  planId: number;
  planName: string | null;
  planCode: string | null;
  billingCycle: string | null;
  amount: number;
  totalPaise: number;
  gstPercent: number;
  gstAmountPaise: number;
  gateway: "WALLET" | "RAZORPAY" | "PRORATION_CREDIT" | string;
  gatewayId: string | null;
  status: "PAID" | "REFUND_PENDING" | "REFUNDED" | "FAILED" | string;
  paymentDate: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  notes: string | null;
  refundable: boolean;
  refundDeadline: string | null;
  daysRemaining: number;
};

type ListResponse = {
  success: boolean;
  items?: PaymentRow[];
  pagination?: { total: number; limit: number; offset: number; hasMore: boolean };
  refundWindowDays?: number;
  /** Injected by the proxy — whether the caller has REFUND action permission. */
  canRefund?: boolean;
  callerIsSuperAdmin?: boolean;
  error?: string;
};

type Props = {
  /** SSR-computed refund capability so the first paint is correct. Client
   *  refreshes from the API response after fetch. */
  initialCanRefund: boolean;
  initialCallerIsSuperAdmin: boolean;
};

type StatusFilter = "ALL" | "PAID" | "REFUND_PENDING" | "REFUNDED" | "FAILED";
type GatewayFilter = "ALL" | "WALLET" | "RAZORPAY" | "PRORATION_CREDIT";

const PAGE_SIZE = 25;

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

function statusPill(s: string) {
  const map: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    REFUND_PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    REFUNDED: "bg-slate-100 text-slate-600 border-slate-300",
    FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[s] ?? "bg-slate-100 text-slate-600 border-slate-300";
}

function gatewayIcon(g: string) {
  if (g === "WALLET") return <Wallet size={14} className="text-indigo-600" />;
  if (g === "RAZORPAY") return <CreditCard size={14} className="text-blue-600" />;
  return <CircleAlert size={14} className="text-slate-500" />;
}

function daysRemainingBadge(row: PaymentRow) {
  if (row.status === "REFUNDED") {
    return <span className="text-xs text-slate-400">—</span>;
  }
  if (row.status === "REFUND_PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
        <Loader2 size={10} className="animate-spin" /> Pending
      </span>
    );
  }
  if (!row.refundDeadline) return <span className="text-xs text-slate-400">—</span>;
  if (row.daysRemaining <= 0) {
    return (
      <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
        Window expired
      </span>
    );
  }
  const tone =
    row.daysRemaining <= 1
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : row.daysRemaining <= 3
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] ${tone}`}>
      {row.daysRemaining}d left
    </span>
  );
}

export function SubscriptionRefundsClient({
  initialCanRefund,
  initialCallerIsSuperAdmin,
}: Props) {
  const { toast } = useToast();

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundWindowDays, setRefundWindowDays] = useState(7);
  // Backend-authoritative permission. SSR seeds; API response overrides on
  // every fetch so a permission change (grant / revoke) takes effect on the
  // very next refresh without a full page reload.
  const [canRefund, setCanRefund] = useState(initialCanRefund);
  const [callerIsSuperAdmin, setCallerIsSuperAdmin] = useState(initialCallerIsSuperAdmin);

  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [gateway, setGateway] = useState<GatewayFilter>("ALL");

  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);

  // Debounce free-text search so we don't fire a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset offset when filters change so pagination doesn't get stuck on page N
  // of a smaller result set.
  useEffect(() => {
    setOffset(0);
  }, [searchDebounced, status, gateway]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (status !== "ALL") qs.set("status", status);
      if (gateway !== "ALL") qs.set("gateway", gateway);
      if (searchDebounced) qs.set("search", searchDebounced);

      const res = await fetch(`/api/admin/merchant-subscriptions/payments?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ListResponse;
      if (!res.ok || !data.success || !data.items) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setItems(data.items);
      setTotal(data.pagination?.total ?? data.items.length);
      if (data.refundWindowDays) setRefundWindowDays(data.refundWindowDays);
      if (typeof data.canRefund === "boolean") setCanRefund(data.canRefund);
      if (typeof data.callerIsSuperAdmin === "boolean") {
        setCallerIsSuperAdmin(data.callerIsSuperAdmin);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, status, gateway, searchDebounced]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const stats = useMemo(() => {
    const paid = items.filter((r) => r.status === "PAID").length;
    const refunded = items.filter((r) => r.status === "REFUNDED").length;
    const pending = items.filter((r) => r.status === "REFUND_PENDING").length;
    const refundable = items.filter((r) => r.refundable).length;
    return { paid, refunded, pending, refundable };
  }, [items]);

  const handleRefundSuccess = useCallback(
    (paymentId: number, newStatus: "REFUNDED" | "REFUND_PENDING", refundReference: string) => {
      setItems((prev) =>
        prev.map((r) =>
          r.id === paymentId
            ? {
                ...r,
                status: newStatus,
                refundable: false,
                subscriptionStatus: "REFUNDED",
                subscriptionIsActive: false,
                notes: r.notes
                  ? `${r.notes}\n[refund] ${refundReference}`
                  : `[refund] ${refundReference}`,
              }
            : r
        )
      );
    },
    []
  );

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + items.length, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-900">Merchant subscription refunds</h1>
          <p className="mt-1 text-sm text-slate-500">
            Full refunds only. Wallet payments credit back to the merchant wallet; Razorpay
            payments call the Razorpay Refund API. Subscription is revoked immediately in
            either case.{" "}
            <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
              <ShieldCheck size={10} /> {refundWindowDays}-day window
            </span>{" "}
            <span
              className={`ml-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                callerIsSuperAdmin
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : canRefund
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
              title={
                callerIsSuperAdmin
                  ? "Super admin — all actions allowed"
                  : canRefund
                  ? "You have refund permission on the MERCHANT dashboard"
                  : "You have view-only access — contact a super admin to grant REFUND action"
              }
            >
              {callerIsSuperAdmin ? (
                <>
                  <ShieldCheck size={10} /> Super admin
                </>
              ) : canRefund ? (
                <>
                  <ShieldCheck size={10} /> Refund enabled
                </>
              ) : (
                <>
                  <Eye size={10} /> View only
                </>
              )}
            </span>
          </p>
        </div>
        <button
          onClick={() => void loadPage()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpDown size={14} />}
          Refresh
        </button>
      </div>

      {/* Prominent view-only notice — agents without REFUND action should see
          the list but understand why the Refund button isn't there. */}
      {!canRefund ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <Lock size={14} className="mt-0.5 shrink-0 text-slate-500" />
          <div className="leading-relaxed">
            <strong>View-only access.</strong> You can browse subscription payments but cannot
            issue refunds. To refund, your MERCHANT dashboard access must include the{" "}
            <code className="rounded bg-slate-200/60 px-1 py-0.5 font-mono text-[10px] text-slate-700">
              REFUND
            </code>{" "}
            action. Contact a super admin from the Super Admin → User Access page to request it.
          </div>
        </div>
      ) : null}

      {/* ── Summary tiles ─────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Total on page" value={items.length} color="slate" />
        <SummaryTile label="Paid" value={stats.paid} color="emerald" />
        <SummaryTile
          label={canRefund ? "Refundable now" : "Refundable (view only)"}
          value={stats.refundable}
          color="indigo"
        />
        <SummaryTile label="Refunded" value={stats.refunded + stats.pending} color="rose" />
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store name / store id / Razorpay payment id"
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="ALL">All statuses</option>
          <option value="PAID">Paid</option>
          <option value="REFUND_PENDING">Refund pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="FAILED">Failed</option>
        </select>
        <select
          value={gateway}
          onChange={(e) => setGateway(e.target.value as GatewayFilter)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="ALL">All gateways</option>
          <option value="RAZORPAY">Razorpay</option>
          <option value="WALLET">Wallet</option>
          <option value="PRORATION_CREDIT">Proration</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Payment</th>
                <th className="px-3 py-2 font-semibold">Merchant / Store</th>
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Paid at</th>
                <th className="px-3 py-2 font-semibold">Window</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-sm text-slate-500">
                    <Loader2 className="mx-auto mb-2 animate-spin" size={18} /> Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                      <AlertCircle size={16} /> {error}
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-sm text-slate-500">
                    No payments match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-slate-50/60 ${
                      row.status === "REFUNDED" ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-slate-800">#{row.id}</div>
                      {row.gatewayId ? (
                        <div className="text-[11px] text-slate-400 font-mono">{row.gatewayId}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-slate-800">
                        {row.storeName || `Store #${row.storeId}`}
                      </div>
                      {row.storePublicId ? (
                        <div className="text-[11px] text-slate-500">{row.storePublicId}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm text-slate-800">{row.planName || `Plan #${row.planId}`}</div>
                      {row.billingCycle ? (
                        <div className="text-[11px] text-slate-500">{row.billingCycle}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-semibold text-slate-800">{paise(row.totalPaise)}</div>
                      {row.gstPercent > 0 ? (
                        <div className="text-[11px] text-slate-500">incl. {row.gstPercent}% GST</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        {gatewayIcon(row.gateway)}
                        {row.gateway}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusPill(
                          row.status
                        )}`}
                      >
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {formatDate(row.paymentDate)}
                    </td>
                    <td className="px-3 py-2.5">{daysRemainingBadge(row)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {row.refundable && canRefund ? (
                        <button
                          onClick={() => setRefundTarget(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
                        >
                          <RotateCcw size={12} /> Refund
                        </button>
                      ) : row.refundable && !canRefund ? (
                        // Refundable by policy, but the current agent lacks
                        // the REFUND action. Show a lock instead of hiding —
                        // makes the permission gate obvious.
                        <span
                          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500"
                          title="Your role does not permit refunds. Contact a super admin."
                        >
                          <Lock size={10} /> Locked
                        </span>
                      ) : row.status === "REFUNDED" || row.status === "REFUND_PENDING" ? (
                        <span className="text-[11px] text-slate-400">—</span>
                      ) : (
                        <span
                          className="cursor-not-allowed text-[11px] text-slate-400"
                          title={
                            row.status !== "PAID"
                              ? "Not refundable — payment status is not PAID"
                              : row.gateway === "PRORATION_CREDIT"
                              ? "Proration credits are not refundable"
                              : "Refund window expired"
                          }
                        >
                          Not eligible
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
          <div>
            {total === 0
              ? "0 results"
              : `Showing ${pageStart}-${pageEnd} of ${total.toLocaleString("en-IN")}`}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={!hasPrev || loading}
              className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!hasNext || loading}
              className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {refundTarget && canRefund ? (
        <RefundModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={(newStatus, ref) => {
            handleRefundSuccess(refundTarget.id, newStatus, ref);
            setRefundTarget(null);
            toast(
              newStatus === "REFUNDED"
                ? "Refunded to wallet. Subscription revoked."
                : "Razorpay refund initiated. Subscription revoked."
            );
          }}
          onError={(msg) => {
            // If the backend returned refund_permission_required mid-flow
            // (rare — permission was revoked between page load and click),
            // close the modal and re-hydrate state via a refresh.
            if (msg.includes("refund_permission_required")) {
              setCanRefund(false);
              setRefundTarget(null);
              toast("Refund permission was revoked. Please refresh.");
              return;
            }
            toast(msg || "Refund failed");
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "slate" | "emerald" | "indigo" | "rose";
}) {
  const map = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  } as const;
  return (
    <div className={`rounded-lg border px-3 py-2 ${map[color]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

function RefundModal({
  payment,
  onClose,
  onSuccess,
  onError,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onSuccess: (newStatus: "REFUNDED" | "REFUND_PENDING", refundReference: string) => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const submit = async () => {
    const r = reason.trim();
    if (r.length < 5) {
      onError("Reason must be at least 5 characters");
      return;
    }
    if (!confirmChecked) {
      onError("Please tick the confirmation box");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/merchant-subscriptions/payments/${payment.id}/refund`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: r }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        onError(data.error || `Refund failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const newStatus: "REFUNDED" | "REFUND_PENDING" =
        payment.gateway === "WALLET" || data.alreadyRefunded === true
          ? "REFUNDED"
          : "REFUND_PENDING";
      onSuccess(newStatus, String(data.refundReference ?? ""));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Refund failed");
      setSubmitting(false);
    }
  };

  const isWallet = payment.gateway === "WALLET";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between p-4 text-white ${
            isWallet
              ? "bg-gradient-to-r from-indigo-500 to-indigo-600"
              : "bg-gradient-to-r from-rose-500 to-rose-600"
          }`}
        >
          <div className="flex items-center gap-3">
            <RotateCcw size={22} />
            <div>
              <div className="text-base font-semibold">Refund payment #{payment.id}</div>
              <div className="text-xs opacity-90">
                {isWallet ? "Wallet credit + revoke" : "Razorpay refund + revoke"}
              </div>
            </div>
          </div>
          <button
            onClick={submitting ? undefined : onClose}
            disabled={submitting}
            className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <Field label="Store">{payment.storeName || `#${payment.storeId}`}</Field>
              <Field label="Plan">{payment.planName || `#${payment.planId}`}</Field>
              <Field label="Amount">{paise(payment.totalPaise)}</Field>
              <Field label="Gateway">{payment.gateway}</Field>
              <Field label="Paid at">{formatDate(payment.paymentDate)}</Field>
              <Field label="Days left">
                {payment.daysRemaining > 0 ? `${payment.daysRemaining} of 7` : "Expired"}
              </Field>
            </div>
          </div>

          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
              isWallet
                ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <div className="leading-relaxed">
              {isWallet ? (
                <>
                  <strong>Wallet path:</strong> {paise(payment.totalPaise)} will be credited to
                  the merchant&apos;s wallet <strong>immediately</strong>. Subscription
                  #{payment.subscriptionId} will be revoked in the same transaction.
                </>
              ) : (
                <>
                  <strong>Razorpay path:</strong> a refund of {paise(payment.totalPaise)} will be
                  filed via the Razorpay Refund API. Subscription #{payment.subscriptionId} is
                  revoked <strong>immediately</strong>. The money reaches the merchant&apos;s
                  original payment method in ~5-7 banking days.
                </>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Reason (visible in ledger + Razorpay notes)
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Merchant requested cancellation within 24h; duplicate charge; testing plan"
              disabled={submitting}
              maxLength={500}
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-400">
              <span>Min 5 characters</span>
              <span>{reason.length}/500</span>
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 accent-rose-600"
            />
            <span>
              I understand this <strong>revokes the subscription immediately</strong> and cannot be
              undone. The merchant will lose paid features right away.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 p-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || reason.trim().length < 5 || !confirmChecked}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              isWallet
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {submitting ? "Refunding…" : `Refund ${paise(payment.totalPaise)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}
