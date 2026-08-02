"use client";

/**
 * Super Admin — Ride Billing & Wallet hub.
 *
 * Single-page control surface for the Ride Settlement Engine's operational
 * policy: negative-wallet thresholds, cash settlement toggle, and auto-unblock
 * behaviour. All bill rules, commission rates, and per-geo payout percentages
 * live in their own hubs — this page LINKS to them rather than duplicating.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BarChart3,
  Check,
  ChevronRight,
  Coins,
  History,
  LineChart,
  Loader2,
  Percent,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";

type Policy = {
  serviceNegativeThreshold: number;
  globalBlockThreshold: number;
  cashSettlementEnabled: boolean;
  autoUnblockOnZero: boolean;
  commissionOnToll?: boolean;
};

type HistoryRow = {
  id: number;
  serviceNegativeThreshold: number;
  globalBlockThreshold: number;
  cashSettlementEnabled: boolean;
  autoUnblockOnZero: boolean;
  commissionOnToll?: boolean;
  changedBySystemUserId: number | null;
  reason: string | null;
  effectiveFrom: string;
  createdAt: string;
};

type SummaryReport = {
  range: { fromIso: string; toIso: string };
  totals: {
    rides: number;
    customerBill: number;
    customerPaid: number;
    companyReceivable: number;
    companyReceived: number;
    riderEarnings: number;
    outstanding: number;
    walletDebit: number;
    walletCredit: number;
    commission: number;
    taxes: number;
    surgeTotal: number;
    surgeCustomerShare: number;
    surgeCompanyShare: number;
    discountTotal: number;
    couponDiscount: number;
    companyFundedDiscount: number;
  };
  byPaymentMode: Array<{
    paymentMode: string;
    rides: number;
    customerBill: number;
    companyReceivable: number;
    companyReceived: number;
    riderEarnings: number;
    outstanding: number;
  }>;
  byStatus: Array<{ status: string; rides: number; outstanding: number }>;
};

type CashReport = {
  range: { fromIso: string; toIso: string };
  cashRides: number;
  cashCustomerBill: number;
  cashCompanyReceivable: number;
  cashWalletDebit: number;
  outstandingCashCompany: number;
  topRiders: Array<{
    riderId: number;
    rides: number;
    companyReceivable: number;
    walletDebit: number;
  }>;
};

type Watchlist = {
  items: Array<{
    riderId: number;
    currentBalance: number;
    serviceNegativeUsage: number;
    blockedServices: string[];
    blockReason: string | null;
    lastBlockedAt: string | null;
  }>;
};

function inr(n: number | undefined | null): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const DEFAULT_POLICY: Policy = {
  serviceNegativeThreshold: 50,
  globalBlockThreshold: -200,
  cashSettlementEnabled: true,
  autoUnblockOnZero: true,
  commissionOnToll: false,
};

const RELATED_LINKS = [
  {
    href: "/dashboard/super-admin/commission",
    title: "Rider payout percentages",
    subtitle:
      "Platform vs rider % per geo (service_payout_rules). Powers the Hybrid Residual Take-Rate commission. Waiting max + funding live here too.",
    Icon: Percent,
  },
  {
    href: "/dashboard/super-admin/billing",
    title: "Billing rules, fees & GST",
    subtitle:
      "Ride platform / convenience fees, per-component GST (waiting/night/toll/service), discounts, coupons. Enable/disable each rule.",
    Icon: BarChart3,
  },
  {
    href: "/dashboard/super-admin/geo",
    title: "Geo pricing, surge & night",
    subtitle:
      "State / city slabs (base, per-km), surge funding modes, night windows, waiting rules, service availability.",
    Icon: Coins,
  },
  {
    href: "/dashboard/super-admin/billing",
    title: "Cancellation compensation",
    subtitle:
      "Pre-pickup compensation rules (Fixed / Per KM / %) for Ride, Parcel, Food — configure via billing / financial rules.",
    Icon: ShieldAlert,
  },
];

export default function RideBillingWalletHub() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Policy>(DEFAULT_POLICY);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [cashReport, setCashReport] = useState<CashReport | null>(null);
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [policyRes, historyRes] = await Promise.all([
        fetch("/api/admin/ride-wallet-config", { cache: "no-store" }),
        fetch("/api/admin/ride-wallet-config/history", { cache: "no-store" }),
      ]);
      if (!policyRes.ok) throw new Error(`Load failed (${policyRes.status})`);
      const policyJson = (await policyRes.json()) as Policy;
      setPolicy(policyJson);
      setDraft(policyJson);
      if (historyRes.ok) {
        const j = (await historyRes.json()) as { items?: HistoryRow[] };
        setHistory(Array.isArray(j.items) ? j.items : []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load policy";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const [summaryRes, cashRes, watchRes] = await Promise.all([
        fetch("/api/admin/ride-settlement-reports/summary", { cache: "no-store" }),
        fetch("/api/admin/ride-settlement-reports/cash-recovery", {
          cache: "no-store",
        }),
        fetch("/api/admin/ride-settlement-reports/negative-wallet-watchlist", {
          cache: "no-store",
        }),
      ]);
      if (summaryRes.ok) setSummary((await summaryRes.json()) as SummaryReport);
      if (cashRes.ok) setCashReport((await cashRes.json()) as CashReport);
      if (watchRes.ok) setWatchlist((await watchRes.json()) as Watchlist);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[ride-billing-wallet] reports refresh failed", e);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshReports();
  }, [refreshReports]);

  const isDirty = useMemo(() => {
    if (!policy) return false;
    return (
      draft.serviceNegativeThreshold !== policy.serviceNegativeThreshold ||
      draft.globalBlockThreshold !== policy.globalBlockThreshold ||
      draft.cashSettlementEnabled !== policy.cashSettlementEnabled ||
      draft.autoUnblockOnZero !== policy.autoUnblockOnZero ||
      Boolean(draft.commissionOnToll) !== Boolean(policy.commissionOnToll)
    );
  }, [draft, policy]);

  const invalid = useMemo(() => {
    if (!(draft.serviceNegativeThreshold > 0)) {
      return "Per-service threshold must be a positive number";
    }
    if (!(draft.globalBlockThreshold < 0)) {
      return "Global block threshold must be a negative number";
    }
    return null;
  }, [draft]);

  const save = useCallback(async () => {
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ride-wallet-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceNegativeThreshold: draft.serviceNegativeThreshold,
          globalBlockThreshold: draft.globalBlockThreshold,
          cashSettlementEnabled: draft.cashSettlementEnabled,
          autoUnblockOnZero: draft.autoUnblockOnZero,
          commissionOnToll: Boolean(draft.commissionOnToll),
          reason: reason.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      } & Policy;
      if (!res.ok) {
        throw new Error(json.message || json.error || `Save failed (${res.status})`);
      }
      setPolicy({
        serviceNegativeThreshold: json.serviceNegativeThreshold,
        globalBlockThreshold: json.globalBlockThreshold,
        cashSettlementEnabled: json.cashSettlementEnabled,
        autoUnblockOnZero: json.autoUnblockOnZero,
        commissionOnToll: Boolean(json.commissionOnToll),
      });
      setDraft({
        serviceNegativeThreshold: json.serviceNegativeThreshold,
        globalBlockThreshold: json.globalBlockThreshold,
        cashSettlementEnabled: json.cashSettlementEnabled,
        autoUnblockOnZero: json.autoUnblockOnZero,
        commissionOnToll: Boolean(json.commissionOnToll),
      });
      setReason("");
      setSavedAt(Date.now());
      // Immediately re-pull history so the audit trail shows the new row.
      const historyRes = await fetch("/api/admin/ride-wallet-config/history", {
        cache: "no-store",
      });
      if (historyRes.ok) {
        const j = (await historyRes.json()) as { items?: HistoryRow[] };
        setHistory(Array.isArray(j.items) ? j.items : []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [draft, invalid, reason]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/super-admin"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Super admin
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Ride billing & wallet
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Ride Settlement Engine operational policy. Changes take effect
            immediately across cash confirm, negative-wallet blocks, and the
            rider dashboard — no deploy required.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-4 w-4" /> <span>{error}</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Wallet policy</h2>
            <p className="text-xs text-slate-500">
              Thresholds are enforced in{" "}
              <code className="rounded bg-slate-100 px-1">
                syncNegativeWalletBlocks
              </code>
              . Only "negative_wallet" / "global_emergency" blocks are recomputed
              — fraud / manual blocks are preserved.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Per-service negative threshold (₹)
            </span>
            <input
              type="number"
              min={1}
              max={100000}
              value={draft.serviceNegativeThreshold}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  serviceNegativeThreshold: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Rider is blocked from taking new rides once this service's
              negative usage exceeds this value. Default: 50.
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Global block threshold (₹)
            </span>
            <input
              type="number"
              max={-1}
              value={draft.globalBlockThreshold}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  globalBlockThreshold: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Total balance ≤ this value blocks ALL services immediately.
              Must be a negative number. Default: -200.
            </p>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <input
              type="checkbox"
              checked={draft.cashSettlementEnabled}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  cashSettlementEnabled: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Banknote className="h-4 w-4 text-emerald-600" />
                Cash settlement enabled
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                When off, the rider's cash-confirm endpoint returns 403. Online
                settlement is unaffected.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <input
              type="checkbox"
              checked={draft.autoUnblockOnZero}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  autoUnblockOnZero: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Auto-unblock when balance ≥ 0
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Clears negative-wallet blocks the instant the rider's total
                balance returns to zero or positive.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <input
              type="checkbox"
              checked={Boolean(draft.commissionOnToll)}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  commissionOnToll: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Commission on toll (off by default)
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                When off, toll is a full rider pass-through (customer reimburses
                rider; no platform commission). Enable only if legally required.
              </p>
            </div>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Reason for this change (optional — recorded in audit log)
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. raising limits for festive weekend"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {policy ? (
              <>
                Live values —{" "}
                <span className="font-mono text-slate-700">
                  service {policy.serviceNegativeThreshold} / global{" "}
                  {policy.globalBlockThreshold} / cash{" "}
                  {policy.cashSettlementEnabled ? "on" : "off"}
                </span>
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <div className="flex items-center gap-3">
            {savedAt ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => policy && setDraft(policy)}
              disabled={!isDirty || saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!isDirty || saving || Boolean(invalid)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save policy
            </button>
          </div>
        </div>
        {invalid ? (
          <p className="mt-2 text-xs font-semibold text-red-600">{invalid}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Change history</h2>
            <p className="text-xs text-slate-500">
              Every save appends an immutable row to
              <code className="ml-1 rounded bg-slate-100 px-1">
                ride_wallet_config_history
              </code>
              .
            </p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">
            No changes recorded yet — the current policy is the seeded default.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Per-service</th>
                  <th className="px-3 py-2">Global</th>
                  <th className="px-3 py-2">Cash</th>
                  <th className="px-3 py-2">Auto-unblock</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((row) => (
                  <tr key={row.id} className="text-slate-800">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                      {new Date(row.effectiveFrom).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      ₹{row.serviceNegativeThreshold}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      ₹{row.globalBlockThreshold}
                    </td>
                    <td className="px-3 py-2">
                      {row.cashSettlementEnabled ? "on" : "off"}
                    </td>
                    <td className="px-3 py-2">
                      {row.autoUnblockOnZero ? "on" : "off"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600">
                      {row.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <LineChart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Settlement reports · last 7 days
              </h2>
              <p className="text-xs text-slate-500">
                Aggregated from{" "}
                <code className="rounded bg-slate-100 px-1">ride_settlements</code>{" "}
                — matches Hybrid Residual Take-Rate posted at ride time.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshReports()}
            disabled={reportsLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {reportsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Rides", value: summary.totals.rides.toLocaleString("en-IN") },
              { label: "Customer bill", value: inr(summary.totals.customerBill) },
              { label: "Company received", value: inr(summary.totals.companyReceived) },
              { label: "Rider earnings", value: inr(summary.totals.riderEarnings) },
              { label: "Commission", value: inr(summary.totals.commission) },
              { label: "Taxes", value: inr(summary.totals.taxes) },
              { label: "Wallet debit", value: inr(summary.totals.walletDebit) },
              { label: "Outstanding", value: inr(summary.totals.outstanding) },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t.label}
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                  {t.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {reportsLoading ? "Loading…" : "No settlements recorded yet."}
          </p>
        )}

        {summary && summary.byPaymentMode.length > 0 ? (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Cash vs online
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Rides</th>
                    <th className="px-3 py-2">Customer bill</th>
                    <th className="px-3 py-2">Company received</th>
                    <th className="px-3 py-2">Rider earnings</th>
                    <th className="px-3 py-2">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.byPaymentMode.map((row) => (
                    <tr key={row.paymentMode} className="text-slate-800">
                      <td className="px-3 py-2 font-semibold uppercase tracking-wide text-xs">
                        {row.paymentMode}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.rides}</td>
                      <td className="px-3 py-2 font-mono">{inr(row.customerBill)}</td>
                      <td className="px-3 py-2 font-mono">
                        {inr(row.companyReceived)}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {inr(row.riderEarnings)}
                      </td>
                      <td className="px-3 py-2 font-mono text-amber-700">
                        {inr(row.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Cash recovery · last 7 days
            </h2>
            <p className="text-xs text-slate-500">
              Company receivable owed by riders after cash rides, and the
              amount recovered via wallet debits.
            </p>
          </div>
        </div>
        {cashReport ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Cash rides
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                  {cashReport.cashRides.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Customer bill
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                  {inr(cashReport.cashCustomerBill)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Company receivable
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-900">
                  {inr(cashReport.cashCompanyReceivable)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Wallet debit (recovered)
                </div>
                <div className="mt-1 font-mono text-base font-semibold text-emerald-700">
                  {inr(cashReport.cashWalletDebit)}
                </div>
              </div>
            </div>

            {cashReport.topRiders.length > 0 ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Top cash-generating riders
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Rider</th>
                        <th className="px-3 py-2">Rides</th>
                        <th className="px-3 py-2">Company receivable</th>
                        <th className="px-3 py-2">Wallet debit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cashReport.topRiders.map((r) => (
                        <tr key={r.riderId} className="text-slate-800">
                          <td className="px-3 py-2 font-mono">#{r.riderId}</td>
                          <td className="px-3 py-2 font-mono">{r.rides}</td>
                          <td className="px-3 py-2 font-mono">
                            {inr(r.companyReceivable)}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {inr(r.walletDebit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">
            {reportsLoading ? "Loading…" : "No cash rides recorded yet."}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Negative wallet watchlist
            </h2>
            <p className="text-xs text-slate-500">
              Riders currently in the red under the wallet policy above. Fraud
              / manual / compliance blocks are excluded.
            </p>
          </div>
        </div>
        {watchlist && watchlist.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Rider</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Per-service negative</th>
                  <th className="px-3 py-2">Blocked services</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Last event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {watchlist.items.map((row) => (
                  <tr key={row.riderId} className="text-slate-800">
                    <td className="px-3 py-2 font-mono">#{row.riderId}</td>
                    <td
                      className={`px-3 py-2 font-mono ${
                        row.currentBalance < 0 ? "text-red-700" : ""
                      }`}
                    >
                      {inr(row.currentBalance)}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {inr(row.serviceNegativeUsage)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.blockedServices.length > 0
                        ? row.blockedServices.join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.blockReason ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                      {row.lastBlockedAt
                        ? new Date(row.lastBlockedAt).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {reportsLoading
              ? "Loading…"
              : "No riders are currently on the negative-wallet watchlist."}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Related controls</h2>
        <p className="mb-4 text-xs text-slate-500">
          Ride economics that live in their own dedicated hubs — the wallet
          policy above sits on top of these engines.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {RELATED_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-indigo-300 hover:bg-white hover:shadow"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm">
                <link.Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">
                    {link.title}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{link.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
