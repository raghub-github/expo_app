"use client";

/**
 * Post-paid settlements (Person Ride + Parcel) — every job's customer fare vs
 * rider earning, how it was paid, the wallet movement between them, and whether
 * it needs a reconciliation decision. Read-only except "Resolve", which records
 * the admin's decision; money corrections go through wallet adjustments.
 */
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

type Row = {
  settlementId: string;
  orderCoreId: number;
  orderId: string;
  riderId: number | null;
  serviceType: "person_ride" | "parcel";
  paymentMode: string;
  customerPayable: number;
  customerPaid: number;
  cashCollected: number;
  riderEntitlement: number;
  walletCredit: number;
  walletDebit: number;
  platformShare: number;
  promotionalSubsidy: number;
  tax: number;
  tip: number;
  incentive: number;
  discount: number;
  walletBalanceBefore: number | null;
  walletBalanceAfter: number | null;
  gatewayPaymentId: string | null;
  status: string;
  reconciliationStatus: string;
  reconciliationReason: string | null;
  postedAt: string;
};

type Filters = {
  service: "" | "person_ride" | "parcel";
  method: "" | "cash" | "online";
  status: "" | "pending" | "settled" | "failed" | "reversed";
  reconciliation: "" | "required" | "resolved" | "none";
  days: number;
  q: string;
};

const PAGE = 50;

function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function walletCell(r: Row): { text: string; tone: string } {
  if (r.walletDebit > 0) return { text: `−${inr(r.walletDebit)}`, tone: "text-red-600" };
  if (r.walletCredit > 0) return { text: `+${inr(r.walletCredit)}`, tone: "text-emerald-700" };
  return { text: inr(0), tone: "text-slate-500" };
}

export function PostpaidSettlementsSection() {
  const [filters, setFilters] = useState<Filters>({
    service: "",
    method: "",
    status: "",
    reconciliation: "",
    days: 7,
    q: "",
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setError(null);
      try {
        const to = new Date();
        const from = new Date(to.getTime() - filters.days * 24 * 60 * 60 * 1000);
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          limit: String(PAGE),
          offset: String(nextOffset),
        });
        if (filters.service) params.set("service", filters.service);
        if (filters.method) params.set("method", filters.method);
        if (filters.status) params.set("status", filters.status);
        if (filters.reconciliation) params.set("reconciliation", filters.reconciliation);
        if (filters.q.trim()) params.set("q", filters.q.trim());
        const res = await fetch(`/api/admin/ride-settlement-reports/settlements?${params}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          items?: Row[];
          total?: number;
          error?: string;
        };
        if (!res.ok) {
          // 5xx bodies carry internal error names (e.g. "TypeError") — not useful to an admin.
          throw new Error(
            res.status >= 500
              ? `Settlements could not be loaded — server error (${res.status}). Try Refresh.`
              : json.error || `Load failed (${res.status})`
          );
        }
        setRows(Array.isArray(json.items) ? json.items : []);
        setTotal(Number(json.total ?? 0));
        setOffset(nextOffset);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load settlements");
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const resolve = useCallback(
    async (row: Row) => {
      const note = window.prompt(
        `Resolve reconciliation for ${row.orderId}?\n\n${row.reconciliationReason ?? ""}\n\nRecord your decision (any money correction must be done as a wallet adjustment):`
      );
      if (!note || note.trim().length < 3) return;
      setResolving(row.settlementId);
      try {
        const res = await fetch(
          `/api/admin/ride-settlement-reports/settlements/${encodeURIComponent(row.settlementId)}/resolve`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note: note.trim() }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || `Resolve failed (${res.status})`);
        await load(offset);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Resolve failed");
      } finally {
        setResolving(null);
      }
    },
    [load, offset]
  );

  const select = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: Array<[string, string]>
  ) => (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Ride &amp; Parcel settlements</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Customer fare and rider earning are separate engines. Cash: the rider keeps
            the cash and the wallet moves by earning − fare. Online: the earning is
            credited in full. Customer cash is never a wallet credit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(offset)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {select("Service", filters.service, (v) => setFilters((f) => ({ ...f, service: v as Filters["service"] })), [
          ["", "All"],
          ["person_ride", "Person Ride"],
          ["parcel", "Parcel"],
        ])}
        {select("Method", filters.method, (v) => setFilters((f) => ({ ...f, method: v as Filters["method"] })), [
          ["", "All"],
          ["cash", "Cash"],
          ["online", "Online"],
        ])}
        {select("Status", filters.status, (v) => setFilters((f) => ({ ...f, status: v as Filters["status"] })), [
          ["", "All"],
          ["settled", "Settled"],
          ["pending", "Pending"],
          ["failed", "Failed"],
          ["reversed", "Reversed / refunded"],
        ])}
        {select(
          "Reconciliation",
          filters.reconciliation,
          (v) => setFilters((f) => ({ ...f, reconciliation: v as Filters["reconciliation"] })),
          [
            ["", "All"],
            ["required", "Reconciliation required"],
            ["resolved", "Resolved"],
            ["none", "Clean"],
          ]
        )}
        {select("Period", String(filters.days), (v) => setFilters((f) => ({ ...f, days: Number(v) })), [
          ["1", "24 hours"],
          ["7", "7 days"],
          ["30", "30 days"],
          ["90", "90 days"],
        ])}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Order / settlement id
          </span>
          <input
            type="text"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="GM10000430"
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
      </div>

      {error ? <p className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Order</th>
              <th className="px-2 py-2">Service / method</th>
              <th className="px-2 py-2 text-right">Customer fare</th>
              <th className="px-2 py-2 text-right">Cash collected</th>
              <th className="px-2 py-2 text-right">Rider earning</th>
              <th className="px-2 py-2 text-right">Wallet</th>
              <th className="px-2 py-2 text-right">Platform share</th>
              <th className="px-2 py-2 text-right">Subsidy</th>
              <th className="px-2 py-2 text-right">Tax / tip / incentive</th>
              <th className="px-2 py-2 text-right">Balance before → after</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center text-slate-500">
                  No settlements in this range.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => {
              const wallet = walletCell(r);
              const needsReview = r.reconciliationStatus === "required";
              return (
                <tr key={r.settlementId} className={needsReview ? "bg-amber-50/60" : undefined}>
                  <td className="px-2 py-2 align-top">
                    <div className="font-semibold text-slate-900">{r.orderId}</div>
                    <div className="text-[10px] text-slate-500">
                      rider {r.riderId ?? "—"} · {new Date(r.postedAt).toLocaleString("en-IN")}
                    </div>
                    {r.gatewayPaymentId ? (
                      <div className="font-mono text-[10px] text-slate-400">{r.gatewayPaymentId}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {r.serviceType === "parcel" ? "Parcel" : "Ride"} ·{" "}
                    <span className="font-semibold">{r.paymentMode}</span>
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    {inr(r.customerPayable)}
                    {r.discount > 0 ? (
                      <div className="text-[10px] text-slate-500">offer {inr(r.discount)}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    {r.paymentMode === "cash" ? inr(r.cashCollected) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right align-top font-semibold">{inr(r.riderEntitlement)}</td>
                  <td className={`px-2 py-2 text-right align-top font-semibold ${wallet.tone}`}>{wallet.text}</td>
                  <td className="px-2 py-2 text-right align-top">{inr(r.platformShare)}</td>
                  <td className="px-2 py-2 text-right align-top">
                    {r.promotionalSubsidy > 0 ? inr(r.promotionalSubsidy) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-slate-600">
                    {inr(r.tax)} / {inr(r.tip)} / {inr(r.incentive)}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-slate-600">
                    {inr(r.walletBalanceBefore)} → {inr(r.walletBalanceAfter)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="font-semibold text-slate-700">{r.status}</div>
                    {needsReview ? (
                      <div className="mt-1 max-w-[260px] space-y-1">
                        <div className="flex items-start gap-1 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{r.reconciliationReason}</span>
                        </div>
                        <button
                          type="button"
                          disabled={resolving === r.settlementId}
                          onClick={() => void resolve(r)}
                          className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                          {resolving === r.settlementId ? "Saving…" : "Resolve"}
                        </button>
                      </div>
                    ) : r.reconciliationStatus === "resolved" ? (
                      <div className="mt-1 flex items-start gap-1 text-[11px] text-emerald-700">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[260px]">{r.reconciliationReason}</span>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE, total)}`} of {total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => void load(Math.max(0, offset - PAGE))}
            className="rounded-lg border border-slate-200 px-3 py-1 font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={offset + PAGE >= total || loading}
            onClick={() => void load(offset + PAGE)}
            className="rounded-lg border border-slate-200 px-3 py-1 font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
