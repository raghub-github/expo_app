"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type AnalyticsPayload = {
  range: { from: string; to: string };
  summary: {
    total_offers: number;
    active_offers: number;
    total_redemptions: number;
    active_users: number;
    orders_applied: number;
    sales_attributed: number;
    discount_total: number;
    budget_total: number;
    budget_consumed: number;
    budget_remaining: number | null;
  };
  perOffer: Array<{
    offer_id: number;
    offer_name: string | null;
    offer_kind: string | null;
    is_active: boolean;
    orders_applied: number;
    redemptions: number;
    unique_users: number;
    sales_attributed: string;
    discount_total: string;
    budget_total: string | null;
    budget_used: string | null;
  }>;
  geoWise: Array<{
    binding_id: number;
    geo_level: string;
    geo_ref_id: string;
    node_name: string | null;
    state_name: string | null;
    state_id: string | null;
    offer_id: number;
    offer_name: string | null;
    orders_applied: number;
    sales_attributed: string;
    discount_total: string;
    state_impact: {
      state_id: string | null;
      state_name: string | null;
      orders_applied: number;
      sales_attributed: string;
      discount_total: string;
      unique_customers: number;
    } | null;
    state_impacts?: Array<{
      state_id: string | null;
      state_name: string | null;
      orders_applied: number;
      sales_attributed: string;
      discount_total: string;
      unique_customers: number;
    }>;
  }>;
  daily: Array<{
    day: string;
    redemptions: number;
    unique_users: number;
    orders_applied: number;
    sales_attributed: string;
    discount_total: string;
  }>;
  monthly: Array<{
    day: string;
    redemptions: number;
    unique_users: number;
    orders_applied: number;
    sales_attributed: string;
    discount_total: string;
  }>;
  recentApplications: Array<{
    application_id: number;
    offer_id: number | null;
    offer_name: string | null;
    offer_title: string;
    order_pk: number | null;
    order_id_text: string | null;
    customer_id: number | null;
    order_status: string | null;
    discount_amount: string;
    sale_amount: string | null;
    applied_at: string;
    usage_status: string | null;
    state_name: string | null;
  }>;
  auditLogs: Array<{
    id: number;
    action_type: string;
    resource_type: string | null;
    resource_id: string | null;
    agent_email: string;
    agent_name: string | null;
    action_details: unknown;
    previous_values: unknown;
    new_values: unknown;
    created_at: string;
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function inr(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function display(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return String(v);
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

function briefJson(v: unknown): string {
  if (v == null) return "—";
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "—";
  }
}

function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  applying,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
  applying?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">From</span>
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">To</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </label>
      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        className="inline-flex min-h-[34px] items-center rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {applying ? "…" : "Apply"}
      </button>
    </div>
  );
}

export default function PlatformOfferAnalyticsClient() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [expandedGeo, setExpandedGeo] = useState<Record<string, boolean>>({});

  const fetchAnalytics = useCallback(async (rangeFrom: string, rangeTo: string, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setApplying(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(`/api/super-admin/billing/platform-offers/analytics?${qs}`);
      const json = (await res.json()) as AnalyticsPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load analytics");
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
    void fetchAnalytics(r.from, r.to, true);
  }, [fetchAnalytics]);

  const onApply = () => {
    void fetchAnalytics(from, to);
  };

  const toggleGeo = (key: string) => {
    setExpandedGeo((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center px-4 sm:px-6 lg:px-8">
        <LoadingSpinner />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50/80 to-white px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Platform offer analytics & audit
          </h1>
          <p className="text-xs text-slate-500">Usage, sales attribution, and admin mutations for platform offers.</p>
        </div>
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onApply={onApply}
          applying={applying}
        />
      </header>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}
      {data?.warning ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {data.warning}
        </div>
      ) : null}

      {s ? (
        <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Total offers" value={s.total_offers} />
          <Stat label="Active offers" value={s.active_offers} />
          <Stat label="Orders applied" value={s.orders_applied} />
          <Stat label="Sales attributed ₹" value={inr(s.sales_attributed)} />
          <Stat label="Discount given ₹" value={inr(s.discount_total)} />
          <Stat label="Redemptions" value={s.total_redemptions} />
          <Stat label="Active users" value={s.active_users} />
          <Stat label="Budget consumed ₹" value={inr(s.budget_consumed)} />
          <Stat
            label="Budget remaining ₹"
            value={s.budget_remaining != null ? inr(s.budget_remaining) : "—"}
          />
          <Stat
            label="Conversion (orders / active)"
            value={s.active_offers > 0 ? (s.orders_applied / s.active_offers).toFixed(2) : "—"}
          />
        </div>
      ) : null}

      <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Per offer performance</h2>
          <p className="text-xs text-slate-500">Orders, sales, discount, users, and budget for each platform offer.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Sales ₹</th>
                <th className="px-3 py-2">Discount ₹</th>
                <th className="px-3 py-2">Redeems</th>
                <th className="px-3 py-2">Users</th>
                <th className="px-3 py-2">Budget</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.perOffer ?? []).map((r) => (
                <tr key={r.offer_id}>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <Link
                      href={`/dashboard/super-admin/offers-coupons/${r.offer_id}/edit`}
                      className="text-indigo-600 hover:underline"
                    >
                      {r.offer_name ?? `#${r.offer_id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{display(r.offer_kind)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.orders_applied}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.sales_attributed)}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.discount_total)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.redemptions}</td>
                  <td className="px-3 py-2 tabular-nums">{r.unique_users}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.budget_used != null ? inr(r.budget_used) : "—"}
                    {r.budget_total != null ? ` / ${inr(r.budget_total)}` : ""}
                  </td>
                  <td className="px-3 py-2">{r.is_active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
              {(data?.perOffer ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    No offers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Application ledger</h2>
            <p className="text-xs text-slate-500">
              Orders where a platform offer was applied (`offer_order_applications`).
            </p>
          </div>
          <DateRangeFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onApply={onApply}
            applying={applying}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Order status</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Sale ₹</th>
                <th className="px-3 py-2">Discount ₹</th>
                <th className="px-3 py-2">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.recentApplications ?? []).map((r) => (
                <tr key={r.application_id}>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtWhen(r.applied_at)}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {r.offer_name ?? r.offer_title}
                    {r.offer_id != null ? (
                      <span className="ml-1 font-mono text-xs text-slate-400">#{r.offer_id}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.order_id_text != null ? (
                      <Link href={`/order/${r.order_id_text}`} className="text-indigo-600 hover:underline">
                        {r.order_id_text}
                      </Link>
                    ) : r.order_pk != null ? (
                      String(r.order_pk)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{display(r.customer_id)}</td>
                  <td className="px-3 py-2">{display(r.order_status)}</td>
                  <td className="px-3 py-2">{display(r.state_name)}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.sale_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.discount_amount)}</td>
                  <td className="px-3 py-2 text-xs">{display(r.usage_status)}</td>
                </tr>
              ))}
              {(data?.recentApplications ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    No applications in range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Geo mappings</h2>
            <p className="text-xs text-slate-500">Expand a row for state-level impact.</p>
          </div>
          <DateRangeFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onApply={onApply}
            applying={applying}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Node</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Sales ₹</th>
                <th className="px-3 py-2">Discount ₹</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.geoWise ?? []).map((r, i) => {
                const key = `${r.binding_id}-${r.offer_id}-${r.geo_ref_id}-${i}`;
                const open = !!expandedGeo[key];
                const impactRows =
                  (r.state_impacts && r.state_impacts.length > 0
                    ? r.state_impacts
                    : r.state_impact
                      ? [r.state_impact]
                      : []) ?? [];
                return (
                  <Fragment key={key}>
                    <tr className="hover:bg-slate-50/60">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleGeo(key)}
                          className="inline-flex rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          aria-expanded={open}
                          aria-label={open ? "Collapse state impact" : "Expand state impact"}
                        >
                          {open ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {r.offer_name ?? `#${r.offer_id}`}
                      </td>
                      <td className="px-3 py-2">{r.geo_level}</td>
                      <td className="px-3 py-2">{r.node_name != null && r.node_name !== "" ? r.node_name : r.geo_ref_id}</td>
                      <td className="px-3 py-2">{display(r.state_name)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.orders_applied}</td>
                      <td className="px-3 py-2 tabular-nums">{inr(r.sales_attributed)}</td>
                      <td className="px-3 py-2 tabular-nums">{inr(r.discount_total)}</td>
                    </tr>
                    {open ? (
                      <tr className="bg-slate-50/80">
                        <td colSpan={8} className="px-3 py-3">
                          {impactRows.length > 0 ? (
                            <div className="ml-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                                  <tr>
                                    <th className="px-3 py-1.5">State</th>
                                    <th className="px-3 py-1.5">Orders</th>
                                    <th className="px-3 py-1.5">Sales</th>
                                    <th className="px-3 py-1.5">Discount</th>
                                    <th className="px-3 py-1.5">Unique customers</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {impactRows.map((impact, idx) => (
                                    <tr key={`${impact.state_name ?? "unk"}-${idx}`}>
                                      <td className="px-3 py-1.5 text-slate-900">
                                        {display(impact.state_name)}
                                      </td>
                                      <td className="px-3 py-1.5 tabular-nums">{impact.orders_applied}</td>
                                      <td className="px-3 py-1.5 tabular-nums">{inr(impact.sales_attributed)}</td>
                                      <td className="px-3 py-1.5 tabular-nums">{inr(impact.discount_total)}</td>
                                      <td className="px-3 py-1.5 tabular-nums">{impact.unique_customers}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="ml-6 text-xs text-slate-500">No state impact for this mapping.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {(data?.geoWise ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No geo mappings in range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Daily</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Orders</th>
                  <th className="px-3 py-2">Sales ₹</th>
                  <th className="px-3 py-2">Discount ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.daily ?? []).map((r) => (
                  <tr key={r.day}>
                    <td className="px-3 py-2">{r.day}</td>
                    <td className="px-3 py-2 tabular-nums">{r.orders_applied}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.sales_attributed)}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.discount_total)}</td>
                  </tr>
                ))}
                {(data?.daily ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      No daily data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Monthly</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2">Orders</th>
                  <th className="px-3 py-2">Sales ₹</th>
                  <th className="px-3 py-2">Discount ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.monthly ?? []).map((r) => (
                  <tr key={r.day}>
                    <td className="px-3 py-2">{r.day}</td>
                    <td className="px-3 py-2 tabular-nums">{r.orders_applied}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.sales_attributed)}</td>
                    <td className="px-3 py-2 tabular-nums">{inr(r.discount_total)}</td>
                  </tr>
                ))}
                {(data?.monthly ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      No monthly data.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Admin audit log</h2>
          <p className="text-xs text-slate-500">
            Create / edit / delete / map / unmap and related platform-offer mutations.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Previous → New</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.auditLogs ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtWhen(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{r.agent_name ?? r.agent_email}</div>
                    <div className="text-xs text-slate-500">{r.agent_email}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.action_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {display(r.resource_type)}
                    {r.resource_id != null ? ` #${r.resource_id}` : ""}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-[11px] text-slate-600">
                    {briefJson(r.action_details)}
                  </td>
                  <td className="max-w-sm truncate px-3 py-2 font-mono text-[11px] text-slate-600">
                    {briefJson(r.previous_values)} → {briefJson(r.new_values)}
                  </td>
                </tr>
              ))}
              {(data?.auditLogs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No admin audit rows yet.
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
