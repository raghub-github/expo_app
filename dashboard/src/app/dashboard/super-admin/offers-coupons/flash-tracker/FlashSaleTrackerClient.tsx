"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OfferAnalyticsModeToggle } from "@/components/super-admin/OfferAnalyticsModeToggle";

type TrackerPayload = {
  range: { from: string; to: string };
  summary: {
    total_redemptions: number;
    reserved: number;
    consumed: number;
    cancelled: number;
    refunded: number;
    unique_customers: number;
    subsidy_spent: number;
    food_count: number;
    ride_count: number;
    parcel_count: number;
    blocked_attempts: number;
  };
  rows: Array<{
    redemption_id: number;
    offer_id: number;
    offer_name: string | null;
    service_type: string;
    store_id: number | null;
    store_name: string | null;
    store_public_id: string | null;
    customer_pk: number | null;
    customer_public_id: string | null;
    order_pk: number | null;
    order_id_text: string | null;
    order_status: string | null;
    original_amount: string | null;
    flash_amount: string | null;
    subsidy_amount: string;
    status: string;
    applied_at: string;
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
    <div className="rounded-xl border border-orange-100 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-orange-700/70">{label}</p>
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

export default function FlashSaleTrackerClient() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<TrackerPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const fetchTracker = useCallback(async (rangeFrom: string, rangeTo: string, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setApplying(true);
    setErr(null);
    try {
      const qs = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(`/api/super-admin/billing/flash-sale-tracker?${qs}`);
      const json = (await res.json()) as TrackerPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load Flash Sale tracker");
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center px-4">
        <LoadingSpinner />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-orange-50/40 via-white to-white px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Flash Sale tracker</h1>
            <OfferAnalyticsModeToggle mode="flash" />
          </div>
          <p className="max-w-2xl text-xs text-slate-500">
            Server-side redemption ledger (`flash_sale_redemptions`). FOOD uniqueness is customer × store ×
            campaign; Ride/Parcel is customer × campaign. Subsidy is platform-funded — catalogue prices stay
            unchanged.
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
            className="inline-flex min-h-[34px] items-center rounded-md bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
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

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5">
        <Stat label="Redemptions" value={s?.total_redemptions ?? 0} />
        <Stat label="Consumed" value={s?.consumed ?? 0} />
        <Stat label="Reserved" value={s?.reserved ?? 0} />
        <Stat label="Customers" value={s?.unique_customers ?? 0} />
        <Stat label="Subsidy ₹" value={inr(s?.subsidy_spent)} />
        <Stat label="Food" value={s?.food_count ?? 0} />
        <Stat label="Ride" value={s?.ride_count ?? 0} />
        <Stat label="Parcel" value={s?.parcel_count ?? 0} />
        <Stat label="Cancelled" value={s?.cancelled ?? 0} />
        <Stat label="Refunded" value={s?.refunded ?? 0} />
      </div>

      <section className="overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
        <div className="border-b border-orange-50 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Redemption ledger</h2>
          <p className="text-xs text-slate-500">
            One row per successful reserve/consume. Public customer ID and formatted order ID shown when joinable.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-sm whitespace-nowrap">
            <thead className="bg-orange-50/60 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Offer</th>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Original ₹</th>
                <th className="px-3 py-2">Flash ₹</th>
                <th className="px-3 py-2">Subsidy ₹</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Order status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows ?? []).map((r) => (
                <tr key={r.redemption_id}>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmtWhen(r.applied_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.service_type}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {r.offer_name ?? "Flash Sale"}
                    <span className="ml-1 font-mono text-xs text-slate-400">#{r.offer_id}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.store_public_id || r.store_name ? (
                      <>
                        <span className="font-mono">{r.store_public_id ?? "—"}</span>
                        {r.store_name ? (
                          <span className="mt-0.5 block text-slate-500">{r.store_name}</span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.order_id_text ? (
                      <Link href={`/order/${r.order_id_text}`} className="text-indigo-600 hover:underline">
                        {r.order_id_text}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.customer_public_id ? (
                      <Link
                        href={`/dashboard/customers?q=${encodeURIComponent(r.customer_public_id)}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {r.customer_public_id}
                      </Link>
                    ) : r.customer_pk != null ? (
                      <span className="text-slate-500">#{r.customer_pk}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.original_amount)}</td>
                  <td className="px-3 py-2 tabular-nums">{inr(r.flash_amount)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-orange-800">
                    {inr(r.subsidy_amount)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusPill(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.order_status ?? "—"}</td>
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                    No Flash Sale redemptions in this range.
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
