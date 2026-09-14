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
  validateCancellationSlabs,
  evaluateCancellationSlabPolicy,
  type CancellationSlab,
} from "@gatimitra/financial-rules";
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
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
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

type CancelService = "food" | "parcel" | "person_ride";

type PolicyServiceConfig = {
  serviceType: CancelService;
  enabled: boolean;
  policyVersion: number;
  updatedBy: string | null;
  updatedAt: string | null;
  slabs: CancellationSlab[];
};

const CANCEL_SERVICES: CancelService[] = ["food", "parcel", "person_ride"];
const CANCEL_SERVICE_LABELS: Record<CancelService, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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

  // Rider-fault cancellation SLAB policy (per service).
  const [policyRows, setPolicyRows] = useState<PolicyServiceConfig[]>([]);
  const [policyDraft, setPolicyDraft] = useState<PolicyServiceConfig[]>([]);
  const [cancelLoading, setCancelLoading] = useState(true);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelSavedAt, setCancelSavedAt] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Preview tool state.
  const [previewService, setPreviewService] = useState<CancelService>("food");
  const [previewAccepted, setPreviewAccepted] = useState<number>(15);
  const [previewRiderFault, setPreviewRiderFault] = useState<number>(9);

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

  const refreshCancelConfig = useCallback(async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/super-admin/rider-cancellation-block-config", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        policy?: PolicyServiceConfig[];
      };
      if (!res.ok || !json.success || !Array.isArray(json.policy)) {
        throw new Error(json.error || `Load failed (${res.status})`);
      }
      setPolicyRows(json.policy);
      setPolicyDraft(clone(json.policy));
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Could not load cancellation policy");
    } finally {
      setCancelLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCancelConfig();
  }, [refreshCancelConfig]);

  const patchService = useCallback(
    (service: CancelService, next: Partial<PolicyServiceConfig>) =>
      setPolicyDraft((prev) =>
        prev.map((r) => (r.serviceType === service ? { ...r, ...next } : r))
      ),
    []
  );

  const patchSlab = useCallback(
    (service: CancelService, slabIdx: number, next: Partial<CancellationSlab>) =>
      setPolicyDraft((prev) =>
        prev.map((r) =>
          r.serviceType === service
            ? { ...r, slabs: r.slabs.map((s, i) => (i === slabIdx ? { ...s, ...next } : s)) }
            : r
        )
      ),
    []
  );

  const addSlab = useCallback(
    (service: CancelService) =>
      setPolicyDraft((prev) =>
        prev.map((r) => {
          if (r.serviceType !== service) return r;
          const last = r.slabs[r.slabs.length - 1];
          const nextMin = last ? (last.maxAccepted ?? last.minAccepted) + 1 : 1;
          const slab: CancellationSlab = {
            slabNumber: (last?.slabNumber ?? 0) + 1,
            minAccepted: nextMin,
            maxAccepted: null,
            blockingEnabled: true,
            thresholdPct: 20,
          };
          // New slab becomes the open-ended tail; cap the previous tail if it was open.
          const slabs = r.slabs.map((s, i) =>
            i === r.slabs.length - 1 && s.maxAccepted == null
              ? { ...s, maxAccepted: nextMin - 1 }
              : s
          );
          return { ...r, slabs: [...slabs, slab] };
        })
      ),
    []
  );

  const removeSlab = useCallback(
    (service: CancelService, slabIdx: number) =>
      setPolicyDraft((prev) =>
        prev.map((r) => {
          if (r.serviceType !== service) return r;
          const slabs = r.slabs
            .filter((_, i) => i !== slabIdx)
            .map((s, i) => ({ ...s, slabNumber: i + 1 }));
          return { ...r, slabs };
        })
      ),
    []
  );

  const validationByService = useMemo(() => {
    const map = new Map<CancelService, string[]>();
    for (const d of policyDraft) map.set(d.serviceType, validateCancellationSlabs(d.slabs));
    return map;
  }, [policyDraft]);

  const cancelInvalid = useMemo(() => {
    for (const [, errs] of validationByService) if (errs.length > 0) return true;
    return false;
  }, [validationByService]);

  const cancelDirty = useMemo(
    () => JSON.stringify(policyRows) !== JSON.stringify(policyDraft),
    [policyRows, policyDraft]
  );

  const saveCancelConfig = useCallback(async () => {
    if (cancelInvalid) {
      setCancelError("Fix the highlighted slab errors before saving.");
      return;
    }
    setCancelSaving(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/super-admin/rider-cancellation-block-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policy: policyDraft.map((r) => ({
            serviceType: r.serviceType,
            enabled: Boolean(r.enabled),
            slabs: r.slabs.map((s) => ({
              slabNumber: Math.trunc(s.slabNumber),
              minAccepted: Math.trunc(s.minAccepted),
              maxAccepted: s.maxAccepted == null ? null : Math.trunc(s.maxAccepted),
              blockingEnabled: Boolean(s.blockingEnabled),
              thresholdPct: Number(s.thresholdPct),
            })),
          })),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        policy?: PolicyServiceConfig[];
      };
      if (!res.ok || !json.success || !Array.isArray(json.policy)) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setPolicyRows(json.policy);
      setPolicyDraft(clone(json.policy));
      setCancelSavedAt(Date.now());
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setCancelSaving(false);
    }
  }, [policyDraft, cancelInvalid]);

  const previewResult = useMemo(() => {
    const svc = policyDraft.find((r) => r.serviceType === previewService);
    if (!svc) return null;
    return evaluateCancellationSlabPolicy({
      enabled: svc.enabled,
      slabs: svc.slabs,
      accepted: Math.max(0, Math.trunc(previewAccepted)),
      riderFault: Math.max(0, Math.trunc(previewRiderFault)),
    });
  }, [policyDraft, previewService, previewAccepted, previewRiderFault]);

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
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Cancellation-rate auto-block
            </h2>
            <p className="max-w-3xl text-xs text-slate-500">
              Per-service{" "}
              <span className="font-semibold text-slate-700">rider-fault</span>{" "}
              cancellation slab policy. Each service has cumulative accepted-order slabs; when a
              rider&apos;s lifetime rider-fault cancellation rate reaches the matching slab&apos;s
              threshold, they are auto-blocked for that service only. A grace slab never blocks.
              Only rider-fault cancellations count — customer, merchant, and system cancellations
              never do. Released only by re-evaluation under the current policy (no manual unblock,
              no timer). Changes take effect within ~60s.
            </p>
          </div>
        </div>

        {cancelError ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <ShieldAlert className="mt-0.5 h-4 w-4" /> <span>{cancelError}</span>
          </div>
        ) : null}

        {cancelLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {policyDraft.map((svc) => {
                const errs = validationByService.get(svc.serviceType) ?? [];
                return (
                  <div
                    key={svc.serviceType}
                    className={`rounded-xl border p-4 ${
                      svc.enabled ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-slate-50/40"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {CANCEL_SERVICE_LABELS[svc.serviceType]}
                        </span>
                        <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                          v{svc.policyVersion}
                        </span>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={svc.enabled}
                          onChange={(e) => patchService(svc.serviceType, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-rose-600"
                        />
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wide ${
                            svc.enabled ? "text-rose-700" : "text-slate-400"
                          }`}
                        >
                          {svc.enabled ? "Enforcing" : "Off"}
                        </span>
                      </label>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <th className="px-2 py-1">Slab</th>
                            <th className="px-2 py-1">Min accepted</th>
                            <th className="px-2 py-1">Max accepted</th>
                            <th className="px-2 py-1">Blocking</th>
                            <th className="px-2 py-1">Rider-fault ≥</th>
                            <th className="px-2 py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {svc.slabs.map((slab, idx) => (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className="px-2 py-1.5 font-mono text-slate-700">{idx + 1}</td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  value={slab.minAccepted}
                                  onChange={(e) =>
                                    patchSlab(svc.serviceType, idx, {
                                      minAccepted: Math.max(1, Math.trunc(Number(e.target.value))),
                                    })
                                  }
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 font-mono"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="∞"
                                  value={slab.maxAccepted ?? ""}
                                  onChange={(e) =>
                                    patchSlab(svc.serviceType, idx, {
                                      maxAccepted:
                                        e.target.value === ""
                                          ? null
                                          : Math.max(1, Math.trunc(Number(e.target.value))),
                                    })
                                  }
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 font-mono"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <label className="inline-flex items-center gap-1 text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={slab.blockingEnabled}
                                    onChange={(e) =>
                                      patchSlab(svc.serviceType, idx, { blockingEnabled: e.target.checked })
                                    }
                                    className="h-4 w-4 accent-rose-600"
                                  />
                                  {slab.blockingEnabled ? "Block" : "Grace"}
                                </label>
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    value={slab.thresholdPct}
                                    disabled={!slab.blockingEnabled}
                                    onChange={(e) =>
                                      patchSlab(svc.serviceType, idx, {
                                        thresholdPct: Number(e.target.value),
                                      })
                                    }
                                    className="w-20 rounded-md border border-slate-200 px-2 py-1 font-mono disabled:bg-slate-100 disabled:text-slate-400"
                                  />
                                  <span className="text-xs text-slate-400">%</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeSlab(svc.serviceType, idx)}
                                  disabled={svc.slabs.length <= 1}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                                  title="Remove slab"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => addSlab(svc.serviceType)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add slab
                      </button>
                      <span className="text-[10px] text-slate-400">
                        Leave Max blank for an open-ended top slab (and above).
                      </span>
                    </div>

                    {errs.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] font-semibold text-red-600">
                        {errs.map((er, i) => (
                          <li key={i}>{er}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Preview / calculator (spec §23) */}
            <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                Policy preview
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs">
                  <span className="mb-1 block text-slate-500">Service</span>
                  <select
                    value={previewService}
                    onChange={(e) => setPreviewService(e.target.value as CancelService)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  >
                    {CANCEL_SERVICES.map((s) => (
                      <option key={s} value={s}>
                        {CANCEL_SERVICE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="mb-1 block text-slate-500">Accepted orders</span>
                  <input
                    type="number"
                    min={0}
                    value={previewAccepted}
                    onChange={(e) => setPreviewAccepted(Number(e.target.value))}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-sm"
                  />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block text-slate-500">Rider-fault cancellations</span>
                  <input
                    type="number"
                    min={0}
                    value={previewRiderFault}
                    onChange={(e) => setPreviewRiderFault(Number(e.target.value))}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-sm"
                  />
                </label>
                {previewResult ? (
                  <div className="ml-auto text-right text-xs">
                    <div className="text-slate-500">
                      Slab{" "}
                      <span className="font-mono text-slate-800">
                        {previewResult.currentSlab?.slabNumber ?? "—"}
                      </span>{" "}
                      · Rate{" "}
                      <span className="font-mono text-slate-800">
                        {previewResult.ratePct.toFixed(2)}%
                      </span>{" "}
                      · Threshold{" "}
                      <span className="font-mono text-slate-800">
                        {previewResult.thresholdPct == null ? "—" : `${previewResult.thresholdPct}%`}
                      </span>
                    </div>
                    <div
                      className={`mt-1 text-sm font-bold ${
                        previewResult.shouldBlock ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {previewResult.shouldBlock
                        ? "SERVICE WILL BE BLOCKED"
                        : `Not blocked (${previewResult.reason.replace(/_/g, " ")})`}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              {cancelSavedAt ? (
                <span className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Check className="h-3.5 w-3.5" /> Saved — re-evaluates in ~60s
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setPolicyDraft(clone(policyRows))}
                disabled={!cancelDirty || cancelSaving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void saveCancelConfig()}
                disabled={!cancelDirty || cancelSaving || cancelInvalid}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {cancelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save cancellation policy
              </button>
            </div>
          </>
        )}
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
