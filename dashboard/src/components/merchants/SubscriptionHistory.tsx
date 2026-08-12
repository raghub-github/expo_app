"use client";

/**
 * Combined subscription history for a merchant store — Control Dashboard view.
 *
 * Shows every purchase AND every refund in one date-sorted timeline. Refund
 * rows include full agent identity (name, email, role, JWT subject id).
 *
 * Inline refund action: purchase rows within the 7-day refund window and in
 * PAID status show a Refund button IF the caller has REFUND permission. The
 * refund goes through /api/admin/merchant-subscriptions/payments/:paymentId
 * /refund which enforces both the window and the permission server-side.
 *
 * Filters: event type (all / purchases / refunds), status, gateway,
 * refundable-only toggle. Debounced free-text search over reason + plan +
 * gateway id.
 *
 * Merchant-facing surfaces (partner site, merchant app) use a different
 * endpoint that strips the actor field.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Filter,
  History,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";

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
  refundable: boolean;
  refundDeadline: string | null;
  daysRemaining: number;
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
  /** When false, hide refund CTA even if API grants canRefund (view-only). */
  allowRefund?: boolean;
};

type EventTypeFilter = "ALL" | "PURCHASE" | "REFUND";
type PurchaseStatusFilter =
  | "ALL"
  | "PAID"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "FAILED"
  | "PENDING";
type GatewayFilter = "ALL" | "WALLET" | "RAZORPAY" | "PRORATION_CREDIT";

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

// Human labels for the refund lifecycle. While Razorpay is still settling the
// money the state is PENDING (purchase side: REFUND_PENDING) → show "Refund
// Processing", NEVER "Refunded". Only the gateway-confirmed state (refund
// COMPLETED / purchase REFUNDED) shows "Refunded".
function refundEventLabel(s: RefundEvent["status"]): string {
  if (s === "PENDING") return "Refund Processing";
  if (s === "COMPLETED") return "Refunded";
  if (s === "FAILED") return "Refund Failed";
  return s;
}
function purchaseStatusLabel(s: string): string {
  if (s === "REFUND_PENDING") return "Refund Processing";
  if (s === "REFUNDED") return "Refunded";
  return s.replace("_", " ");
}

function gatewayIcon(g: string) {
  if (g === "WALLET") return <Wallet size={14} className="text-indigo-600" />;
  if (g === "RAZORPAY") return <CreditCard size={14} className="text-blue-600" />;
  return <CreditCard size={14} className="text-slate-400" />;
}

function daysRemainingChip(p: PurchaseEvent) {
  if (p.status !== "PAID") return null;
  if (!p.refundDeadline) return null;
  if (p.daysRemaining <= 0) {
    return (
      <span
        className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
        title="Refund window (7 days) has expired"
      >
        Window expired
      </span>
    );
  }
  const tone =
    p.daysRemaining <= 1
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : p.daysRemaining <= 3
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
      title={`Refund window closes at ${formatDate(p.refundDeadline)}`}
    >
      {p.daysRemaining}d left
    </span>
  );
}

export function SubscriptionHistory({ storeId, pageSize = 25, allowRefund = true }: Props) {
  const { toast } = useToast();

  const [rows, setRows] = useState<HistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [canRefundApi, setCanRefundApi] = useState(false);
  const canRefund = allowRefund && canRefundApi;
  const [callerIsSuperAdmin, setCallerIsSuperAdmin] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [eventType, setEventType] = useState<EventTypeFilter>("ALL");
  const [status, setStatus] = useState<PurchaseStatusFilter>("ALL");
  const [gateway, setGateway] = useState<GatewayFilter>("ALL");
  const [refundableOnly, setRefundableOnly] = useState(false);

  // Refund modal target
  const [refundTarget, setRefundTarget] = useState<PurchaseEvent | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

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
      if (typeof data.canRefund === "boolean") setCanRefundApi(data.canRefund);
      if (typeof data.callerIsSuperAdmin === "boolean") {
        setCallerIsSuperAdmin(data.callerIsSuperAdmin);
      }
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

  // Client-side filtering. Server returns everything; filters live in-memory
  // to give instant response without extra roundtrips.
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (eventType !== "ALL" && r.eventType !== eventType) return false;
      if (refundableOnly && !(r.eventType === "PURCHASE" && r.refundable)) return false;
      if (status !== "ALL") {
        if (r.eventType === "PURCHASE" && r.status !== status) return false;
        if (r.eventType === "REFUND") return false; // status filter is a purchase concept
      }
      if (gateway !== "ALL" && r.gateway !== gateway) return false;
      if (searchDebounced) {
        const q = searchDebounced;
        const hay = [
          r.planName,
          r.planCode,
          r.gateway,
          r.eventType === "PURCHASE" ? r.gatewayId : null,
          r.eventType === "REFUND" ? r.reason : null,
          r.eventType === "REFUND" ? r.razorpayRefundId : null,
          r.eventType === "REFUND" ? r.razorpayPaymentId : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, eventType, status, gateway, refundableOnly, searchDebounced]);

  const stats = useMemo(() => {
    let purchases = 0;
    let refunds = 0;
    let paid = 0;
    let refunded = 0;
    let refundableCount = 0;
    for (const r of rows) {
      if (r.eventType === "PURCHASE") {
        purchases++;
        if (r.status === "PAID") paid += r.totalPaise;
        if (r.status === "REFUNDED" || r.status === "REFUND_PENDING") refunded += r.totalPaise;
        if (r.refundable) refundableCount++;
      } else {
        refunds++;
      }
    }
    return { purchases, refunds, paid, refunded, refundableCount };
  }, [rows]);

  const activeFilterCount =
    (eventType !== "ALL" ? 1 : 0) +
    (status !== "ALL" ? 1 : 0) +
    (gateway !== "ALL" ? 1 : 0) +
    (refundableOnly ? 1 : 0) +
    (searchDebounced ? 1 : 0);

  const resetFilters = () => {
    setEventType("ALL");
    setStatus("ALL");
    setGateway("ALL");
    setRefundableOnly(false);
    setSearch("");
  };

  const handleRefundSuccess = useCallback(
    (paymentId: number) => {
      // Optimistic in-place update — mark purchase REFUND_PENDING (razorpay)
      // or REFUNDED (wallet). Full refresh follows to pick up the new REFUND
      // event row inserted server-side.
      setRows((prev) =>
        prev.map((r) =>
          r.eventType === "PURCHASE" && r.id === paymentId
            ? { ...r, refundable: false, status: r.gateway === "WALLET" ? "REFUNDED" : "REFUND_PENDING" }
            : r
        )
      );
      void load();
    },
    [load]
  );

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-800">Subscription history</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {total.toLocaleString("en-IN")} events
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
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
                <Lock size={10} /> View only
              </>
            )}
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

      {/* ── Stats tiles ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 border-b border-gray-100 px-4 py-2 sm:grid-cols-5">
        <StatMini label="Purchases" value={stats.purchases.toString()} />
        <StatMini label="Refunds" value={stats.refunds.toString()} />
        <StatMini label="Total paid" value={paise(stats.paid)} tone="emerald" />
        <StatMini label="Refunded" value={paise(stats.refunded)} tone="rose" />
        <StatMini
          label="Refundable now"
          value={stats.refundableCount.toString()}
          tone="indigo"
        />
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/40 px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plan, gateway id, reason…"
            className="w-full rounded-md border border-gray-200 bg-white py-1 pl-7 pr-3 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as EventTypeFilter)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="ALL">All events</option>
          <option value="PURCHASE">Purchases only</option>
          <option value="REFUND">Refunds only</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PurchaseStatusFilter)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          title="Purchase status filter"
        >
          <option value="ALL">All statuses</option>
          <option value="PAID">Paid</option>
          <option value="REFUND_PENDING">Refund pending</option>
          <option value="REFUNDED">Refunded</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
        </select>
        <select
          value={gateway}
          onChange={(e) => setGateway(e.target.value as GatewayFilter)}
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="ALL">All gateways</option>
          <option value="RAZORPAY">Razorpay</option>
          <option value="WALLET">Wallet</option>
          <option value="PRORATION_CREDIT">Proration</option>
        </select>
        <label className="inline-flex select-none items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={refundableOnly}
            onChange={(e) => setRefundableOnly(e.target.checked)}
            className="accent-indigo-600"
          />
          Refundable only
        </label>
        {activeFilterCount > 0 ? (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
          >
            <X size={12} /> Clear ({activeFilterCount})
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] text-gray-400">
            <Filter size={11} /> No filters
          </span>
        )}
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          <Loader2 className="mr-2 animate-spin" size={16} /> Loading…
        </div>
      ) : error ? (
        <div className="m-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {rows.length === 0
            ? "No subscription activity yet."
            : "No events match the current filters."}
        </div>
      ) : (
        <div>
          {filtered.map((r) => {
            const key = `${r.eventType}-${r.id}`;
            const expanded = expandedKey === key;
            return (
              <div key={key} className="border-b border-gray-100 last:border-b-0">
                <div
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-gray-50/60"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
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
                          {r.eventType === "PURCHASE" ? "Purchase" : "Refund"} ·{" "}
                          {r.planName || `Plan #${r.planId}`}
                        </span>
                        {r.eventType === "PURCHASE" ? (
                          <>
                            <span
                              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${purchaseStatusPill(
                                r.status
                              )}`}
                            >
                              {purchaseStatusLabel(r.status)}
                            </span>
                            {daysRemainingChip(r)}
                          </>
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${refundStatusPill(
                              r.status
                            )}`}
                          >
                            {refundEventLabel(r.status)}
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
                              {r.actor.name ||
                                r.actor.email ||
                                `#${r.actor.systemUserId ?? "?"}`}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span className="uppercase tracking-wide">{r.actor.role}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {r.eventType === "PURCHASE" && r.refundable ? (
                      canRefund ? (
                        <button
                          type="button"
                          onClick={() => setRefundTarget(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
                          title="Issue full refund + revoke subscription"
                        >
                          <RotateCcw size={11} /> Refund
                        </button>
                      ) : (
                        <span
                          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500"
                          title="Your role does not permit refunds. Contact a super admin."
                        >
                          <Lock size={10} /> Locked
                        </span>
                      )
                    ) : null}
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={`text-sm font-bold ${
                          r.eventType === "REFUND" ? "text-rose-700" : "text-gray-900"
                        }`}
                      >
                        {r.eventType === "REFUND" ? "−" : ""}
                        {paise(r.totalPaise)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
                {expanded ? (
                  <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                      {r.eventType === "PURCHASE" ? (
                        <>
                          <Field label="Payment ID">#{r.id}</Field>
                          <Field label="Subscription ID">#{r.subscriptionId}</Field>
                          <Field label="Plan code">{r.planCode ?? "—"}</Field>
                          <Field label="Base amount">
                            {paise(r.totalPaise - r.gstAmountPaise)}
                          </Field>
                          {r.gstPercent > 0 ? (
                            <Field label={`GST (${r.gstPercent}%)`}>
                              {paise(r.gstAmountPaise)}
                            </Field>
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
                          <Field label="Refund window">
                            {r.status !== "PAID"
                              ? "Not applicable"
                              : r.daysRemaining <= 0
                              ? "Expired"
                              : `${r.daysRemaining}d left · until ${formatDate(r.refundDeadline)}`}
                          </Field>
                          {r.notes ? (
                            <Field label="Notes" wide>
                              {r.notes}
                            </Field>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Field label="Refund ID">#{r.id}</Field>
                          <Field label="For payment">#{r.paymentId}</Field>
                          <Field label="Subscription ID">#{r.subscriptionId}</Field>
                          <Field label="Reason" wide>
                            {r.reason}
                          </Field>
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

      {/* ── Pagination footer ─────────────────────────────────────────── */}
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

      {refundTarget && canRefund ? (
        <RefundModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => {
            handleRefundSuccess(refundTarget.id);
            setRefundTarget(null);
            toast(
              refundTarget.gateway === "WALLET"
                ? "Refunded to wallet. Subscription revoked."
                : "Razorpay refund initiated. Subscription revoked."
            );
          }}
          onError={(msg) => {
            if (msg.includes("refund_permission_required")) {
              setCanRefundApi(false);
              setRefundTarget(null);
              toast("Refund permission was revoked. Please refresh.");
              return;
            }
            if (msg.includes("refund_window_expired")) {
              setRefundTarget(null);
              toast("Refund window (7 days) has expired. Refreshing…");
              void load();
              return;
            }
            toast(msg || "Refund failed");
          }}
        />
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
  tone?: "slate" | "emerald" | "rose" | "indigo";
}) {
  const map = {
    slate: "text-slate-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
    indigo: "text-indigo-700",
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

/**
 * Advanced refund modal. Reason validation, method-specific explanation
 * (indigo for wallet — instant; rose for razorpay — async), explicit
 * confirmation checkbox, days-remaining reminder.
 */
function RefundModal({
  payment,
  onClose,
  onSuccess,
  onError,
}: {
  payment: PurchaseEvent;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  const isWallet = payment.gateway === "WALLET";
  const canSubmit = reason.trim().length >= 5 && confirmChecked && !submitting;

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
        onError(String(data.error ?? `Refund failed (${res.status})`));
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Refund failed");
      setSubmitting(false);
    }
  };

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
              <ModalField label="Plan">{payment.planName || `#${payment.planId}`}</ModalField>
              <ModalField label="Amount">{paise(payment.totalPaise)}</ModalField>
              <ModalField label="Gateway">{payment.gateway}</ModalField>
              <ModalField label="Paid at">{formatDate(payment.eventAt)}</ModalField>
              <ModalField label="Days remaining">
                {payment.daysRemaining > 0 ? `${payment.daysRemaining} of 7` : "Expired"}
              </ModalField>
              <ModalField label="Subscription ID">#{payment.subscriptionId}</ModalField>
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
                  <strong>Wallet path:</strong> {paise(payment.totalPaise)} will be credited to the
                  merchant&apos;s wallet <strong>immediately</strong>. Subscription #
                  {payment.subscriptionId} will be revoked in the same transaction.
                </>
              ) : (
                <>
                  <strong>Razorpay path:</strong> a refund of {paise(payment.totalPaise)} will be
                  filed via the Razorpay Refund API. Subscription #{payment.subscriptionId} is
                  revoked <strong>immediately</strong>. Money reaches the merchant&apos;s original
                  payment method in ~5-7 banking days.
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
            disabled={!canSubmit}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              isWallet ? "bg-indigo-600 hover:bg-indigo-700" : "bg-rose-600 hover:bg-rose-700"
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

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}
