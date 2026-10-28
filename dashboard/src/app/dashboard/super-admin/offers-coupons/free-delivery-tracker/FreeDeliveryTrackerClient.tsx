"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OfferAnalyticsModeToggle } from "@/components/super-admin/OfferAnalyticsModeToggle";

type TrackerPayload = {
  range: { from: string; to: string };
  summary: {
    total_offers: number;
    active_offers: number;
    eligible_customers: number | null;
    orders_applied: number;
    successful_redemptions: number;
    unique_customers: number;
    delivery_fees_waived: number;
    budget_consumed: number;
    budget_remaining: number | null;
    avg_discount_per_order: number | null;
    cancelled_refunded_redemptions: number;
    conversion_rate: number | null;
    reserved: number;
    consumed: number;
  };
  perOffer: Array<{
    offer_id: number;
    offer_name: string | null;
    coupon_code: string | null;
    is_active: boolean;
    service_type: string | null;
    customer_segment: string | null;
    min_order_amount: string | null;
    orders_applied: number;
    unique_customers: number;
    redemptions: number;
    original_delivery_fees: string;
    delivery_discount: string;
    budget_total: string | null;
    budget_used: string | null;
    budget_remaining: number | null;
    max_uses_per_user: number | null;
    starts_at: string | null;
    ends_at: string | null;
  }>;
  redemptions: Array<{
    redemption_id: number;
    offer_id: number;
    offer_name: string | null;
    coupon_code: string | null;
    customer_pk: number | null;
    customer_public_id: string | null;
    customer_name: string | null;
    order_pk: number | null;
    order_id_text: string | null;
    order_status: string | null;
    original_delivery_fee: string | null;
    discount_applied: string;
    final_delivery_fee: string | null;
    redemption_status: string;
    budget_status: string;
    cancel_refund_status: string | null;
    usage_restored: boolean;
    applied_at: string;
  }>;
  daily: Array<{ day: string; redemptions: number; discount_total: string }>;
  budgetChart: { consumed: number; remaining: number | null; total: number };
  auditLogs: Array<{
    id: number;
    action_type: string;
    resource_id: string | null;
    agent_email: string;
    agent_name: string | null;
    created_at: string;
  }>;
  conflicts: Array<{
    offer_id: number;
    offer_name: string | null;
    coupon_code: string | null;
    is_active: boolean;
    conflict_reason: string;
  }>;
  warning?: string;
};

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

function inr(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-teal-700/70">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "consumed") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "reserved") return "bg-amber-50 text-amber-900 ring-amber-200";
  if (s === "cancelled" || s === "refunded") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function MiniBars({
  title,
  points,
  valueKey,
  format,
}: {
  title: string;
  points: Array<{ day: string; redemptions: number; discount_total: string }>;
  valueKey: "redemptions" | "discount";
  format: (n: number) => string;
}) {
  const vals = points.map((p) =>
    valueKey === "redemptions" ? p.redemptions : parseFloat(p.discount_total) || 0
  );
  const max = Math.max(1, ...vals);
  return (
    <div className="rounded-xl border border-teal-100 bg-white p-3 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-800">{title}</h3>
      {points.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">No data in range</p>
      ) : (
        <div className="mt-3 flex h-28 items-end gap-1">
          {points.map((p, i) => {
            const v = vals[i] ?? 0;
            const h = Math.max(2, Math.round((v / max) * 100));
            return (
              <div key={p.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[9px] tabular-nums text-slate-500">{format(v)}</span>
                <div
                  className="w-full rounded-t bg-teal-500/80"
                  style={{ height: `${h}%` }}
                  title={`${p.day}: ${format(v)}`}
                />
                <span className="truncate text-[9px] text-slate-400">{p.day.slice(5)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FreeDeliveryTrackerClient() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<TrackerPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchTracker = useCallback(async (rangeFrom: string, rangeTo: string, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setApplying(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(`/api/super-admin/billing/free-delivery-tracker?${qs}`);
      const json = (await res.json()) as TrackerPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load Free Delivery tracker");
      setData(json);
      if (json.range?.from && json.range?.to) {
        setFrom(json.range.from);
        setTo(json.range.to);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setApplying(false);
    }
  }, []);

  useEffect(() => {
    const r = defaultRange();
    void fetchTracker(r.from, r.to, true);
  }, [fetchTracker]);

  const filteredRedemptions = useMemo(() => {
    const rows = data?.redemptions ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.redemption_status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.order_id_text ?? "").toLowerCase().includes(q) ||
        (r.customer_public_id ?? "").toLowerCase().includes(q) ||
        (r.customer_name ?? "").toLowerCase().includes(q) ||
        (r.coupon_code ?? "").toLowerCase().includes(q) ||
        String(r.redemption_id).includes(q)
      );
    });
  }, [data?.redemptions, search, statusFilter]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center px-4">
        <LoadingSpinner />
      </div>
    );
  }

  const s = data?.summary;
  const budget = data?.budgetChart;
  const budgetMax = Math.max(1, budget?.total ?? 0, (budget?.consumed ?? 0) + (budget?.remaining ?? 0));

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-teal-50/40 via-white to-white px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Free Delivery tracker
            </h1>
            <OfferAnalyticsModeToggle mode="free_delivery" />
          </div>
          <p className="max-w-2xl text-xs text-slate-500">
            First-order and other FREE_DELIVERY campaigns. Redemptions come from{" "}
            <code className="rounded bg-slate-100 px-1">platform_offer_usages</code>. Budget KPIs are
            lifetime counters on FREE_DELIVERY offers only (Flash excluded). One successful first-order
            benefit per customer — cancel/refund does not restore eligibility.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm"
            />
          </label>
          <button
            type="button"
            disabled={applying}
            onClick={() => void fetchTracker(from, to)}
            className="inline-flex min-h-[34px] items-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
          >
            {applying ? "…" : "Apply"}
          </button>
        </div>
      </header>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}
      {data?.warning ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {data.warning}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Total FD offers" value={s?.total_offers ?? 0} />
        <Stat label="Active offers" value={s?.active_offers ?? 0} />
        <Stat
          label="Eligible customers"
          value={s?.eligible_customers != null ? s.eligible_customers : "—"}
        />
        <Stat label="Orders applied" value={s?.orders_applied ?? 0} />
        <Stat label="Successful redeems" value={s?.successful_redemptions ?? 0} />
        <Stat label="Unique customers" value={s?.unique_customers ?? 0} />
        <Stat label="Fees waived ₹" value={inr(s?.delivery_fees_waived)} />
        <Stat label="Budget consumed ₹" value={inr(s?.budget_consumed)} />
        <Stat
          label="Budget remaining ₹"
          value={s?.budget_remaining != null ? inr(s.budget_remaining) : "—"}
        />
        <Stat
          label="Avg discount / order ₹"
          value={s?.avg_discount_per_order != null ? inr(s.avg_discount_per_order) : "—"}
        />
        <Stat label="Cancelled / refunded" value={s?.cancelled_refunded_redemptions ?? 0} />
        <Stat
          label="Conversion (orders / active)"
          value={s?.conversion_rate != null ? s.conversion_rate.toFixed(2) : "—"}
        />
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <MiniBars
          title="Daily redemptions"
          points={data?.daily ?? []}
          valueKey="redemptions"
          format={(n) => String(n)}
        />
        <MiniBars
          title="Daily delivery discount ₹"
          points={data?.daily ?? []}
          valueKey="discount"
          format={(n) => inr(n)}
        />
        <div className="rounded-xl border border-teal-100 bg-white p-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-800">
            Budget utilization
          </h3>
          <div className="mt-4 space-y-2">
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-teal-600"
                style={{ width: `${((budget?.consumed ?? 0) / budgetMax) * 100}%` }}
                title="Consumed"
              />
              <div
                className="bg-teal-200"
                style={{
                  width: `${((budget?.remaining ?? 0) / budgetMax) * 100}%`,
                }}
                title="Remaining"
              />
            </div>
            <p className="text-xs text-slate-600">
              Consumed ₹{inr(budget?.consumed)} · Remaining{" "}
              {budget?.remaining != null ? `₹${inr(budget.remaining)}` : "—"} · Total ₹
              {inr(budget?.total)}
            </p>
          </div>
        </div>
      </div>

      {(data?.conflicts?.length ?? 0) > 1 ? (
        <section className="mb-5 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm">
          <div className="border-b border-amber-100 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-amber-950">Overlapping FREE_DELIVERY campaigns</h2>
            <p className="text-xs text-amber-800/80">
              Multiple active free-delivery offers can compete; exclusive checkout applies only one.
              Do not deactivate unrelated campaigns from here — use the offer editor.
            </p>
          </div>
          <ul className="divide-y divide-amber-100 text-sm">
            {(data?.conflicts ?? []).map((c) => (
              <li key={c.offer_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div>
                  <Link
                    href={`/dashboard/super-admin/offers-coupons/${c.offer_id}/edit`}
                    className="font-medium text-teal-800 hover:underline"
                  >
                    {c.offer_name ?? `Offer #${c.offer_id}`}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-500">{c.coupon_code ?? "—"}</span>
                </div>
                <span className="text-xs text-amber-900">{c.conflict_reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-5 overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
        <div className="border-b border-teal-50 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Per-offer performance</h2>
          <p className="text-xs text-slate-500">FREE_DELIVERY campaigns only. Click name to edit.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-teal-50/60 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Segment</th>
                <th className="px-3 py-2">Min ₹</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Users</th>
                <th className="px-3 py-2">Redeems</th>
                <th className="px-3 py-2">Discount ₹</th>
                <th className="px-3 py-2">Budget</th>
                <th className="px-3 py-2">Per-user</th>
                <th className="px-3 py-2">Schedule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.perOffer ?? []).map((r) => (
                <tr key={r.offer_id}>
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/dashboard/super-admin/offers-coupons/${r.offer_id}/edit`}
                      className="text-teal-800 hover:underline"
                    >
                      {r.offer_name ?? `Offer #${r.offer_id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.coupon_code ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                        r.is_active
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {r.is_active ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.service_type ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.customer_segment ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.min_order_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.orders_applied}</td>
                  <td className="px-3 py-2 tabular-nums">{r.unique_customers}</td>
                  <td className="px-3 py-2 tabular-nums">{r.redemptions}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.delivery_discount)}</td>
                  <td className="px-3 py-2 tabular-nums text-xs">
                    {inr(r.budget_used)} / {inr(r.budget_total)}
                    {r.budget_remaining != null ? (
                      <span className="mt-0.5 block text-slate-500">left {inr(r.budget_remaining)}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.max_uses_per_user ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {(r.starts_at ? fmtWhen(r.starts_at) : "—") +
                      " → " +
                      (r.ends_at ? fmtWhen(r.ends_at) : "—")}
                  </td>
                </tr>
              ))}
              {(data?.perOffer ?? []).length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                    No FREE_DELIVERY offers configured.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-5 overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-teal-50 px-3 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Customer redemption ledger</h2>
            <p className="text-xs text-slate-500">
              Server-side usages. Phone/address omitted. Order ID links to admin order detail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search order / customer / code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm shadow-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm shadow-sm"
            >
              <option value="all">All statuses</option>
              <option value="consumed">consumed</option>
              <option value="reserved">reserved</option>
              <option value="cancelled">cancelled</option>
              <option value="refunded">refunded</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-teal-50/60 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Original ₹</th>
                <th className="px-3 py-2">Discount ₹</th>
                <th className="px-3 py-2">Final ₹</th>
                <th className="px-3 py-2">Redeem</th>
                <th className="px-3 py-2">Order status</th>
                <th className="px-3 py-2">Budget</th>
                <th className="px-3 py-2">Restored</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRedemptions.map((r) => (
                <tr key={r.redemption_id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.redemption_id}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtWhen(r.applied_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.order_id_text ? (
                      <Link href={`/order/${r.order_id_text}`} className="text-indigo-600 hover:underline">
                        {r.order_id_text}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.customer_public_id ? (
                      <Link
                        href={`/dashboard/customers?q=${encodeURIComponent(r.customer_public_id)}`}
                        className="font-mono text-indigo-600 hover:underline"
                      >
                        {r.customer_public_id}
                      </Link>
                    ) : r.customer_pk != null ? (
                      <span className="font-mono text-slate-500">#{r.customer_pk}</span>
                    ) : (
                      "—"
                    )}
                    {r.customer_name ? (
                      <span className="mt-0.5 block text-slate-500">{r.customer_name}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.offer_name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.coupon_code ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.original_delivery_fee)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-teal-800">
                    {inr(r.discount_applied)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.final_delivery_fee)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusPill(r.redemption_status)}`}
                    >
                      {r.redemption_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.order_status ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.budget_status}</td>
                  <td className="px-3 py-2 text-xs">{r.usage_restored ? "Yes" : "No"}</td>
                </tr>
              ))}
              {filteredRedemptions.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                    No free-delivery redemptions in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
        <div className="border-b border-teal-50 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Admin mutation audit</h2>
          <p className="text-xs text-slate-500">
            FREE_DELIVERY-related offer creates/edits from action_audit_log (no secrets).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-teal-50/60 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.auditLogs ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtWhen(a.created_at)}</td>
                  <td className="px-3 py-2 text-xs">{a.action_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{a.resource_id ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {a.agent_name ?? a.agent_email}
                    {a.agent_name ? (
                      <span className="mt-0.5 block text-slate-400">{a.agent_email}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {(data?.auditLogs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    No FREE_DELIVERY admin mutations in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
